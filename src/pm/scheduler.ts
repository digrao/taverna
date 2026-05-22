import type { TavernaConfig } from '../config.js'
import type { VaultProject, ProjectType, RawFrontmatter } from '../vault/types.js'
import { scanVault, appendLogbook } from '../vault/index.js'
import { updateProjectStatus } from '../vault/update.js'
import { runAgent } from './executor.js'
import { getString } from '../vault/frontmatter.js'

export type ComposeMode = 'inherit' | 'override'

export interface PolicyStep {
  agent: string
  // 'HH:MM' → only eligible when clock hour matches
  // 'EOD'   → only eligible at or after 17:00
  // absent  → always eligible (governed by project runEvery)
  at?: string
}

export interface TypePolicy {
  tipo: ProjectType
  steps: PolicyStep[]
}

export interface ProjectPolicy {
  compose: ComposeMode
  steps: PolicyStep[]
}

export interface SchedulerOptions {
  dryRun?: boolean
  tickMs?: number    // default: 60_000
  maxTicks?: number  // stop after N ticks (useful for testing / one-shot)
  onTick?: (now: Date) => void
}

const FREQ_MS: Record<string, number> = {
  hourly:  3_600_000,
  daily:   86_400_000,
  weekly:  604_800_000,
  monthly: 2_592_000_000,
}

export function readProjectPolicy(raw: RawFrontmatter): ProjectPolicy | undefined {
  const composeRaw = getString(raw, 'schedule_compose')
  const stepsRaw = raw['schedule_steps']

  if (composeRaw === undefined && !Array.isArray(stepsRaw)) return undefined

  const compose: ComposeMode = composeRaw === 'override' ? 'override' : 'inherit'

  const steps: PolicyStep[] = Array.isArray(stepsRaw)
    ? stepsRaw.flatMap((s): PolicyStep[] => {
        if (typeof s === 'string') return [{ agent: s }]
        if (s !== null && typeof s === 'object') {
          const agent = typeof s['agent'] === 'string' ? s['agent'] : undefined
          const at = typeof s['at'] === 'string' ? s['at'] : undefined
          return agent ? [{ agent, ...(at !== undefined ? { at } : {}) }] : []
        }
        return []
      })
    : []

  return { compose, steps }
}

export function mergePolicy(
  typeSteps: PolicyStep[],
  projectPolicy?: ProjectPolicy,
): PolicyStep[] {
  if (!projectPolicy) return typeSteps
  if (projectPolicy.compose === 'override') return projectPolicy.steps
  return [...typeSteps, ...projectPolicy.steps]
}

export function isAtSatisfied(at: string | undefined, now: Date): boolean {
  if (at === undefined) return true
  if (at === 'EOD') return now.getHours() >= 17
  const match = /^(\d{1,2}):(\d{2})$/.exec(at)
  if (!match) return true
  return now.getHours() === Number(match[1])
}

export function isProjectDue(project: VaultProject, now: Date): boolean {
  if (project.runEvery === 'never') return false
  const freq = FREQ_MS[project.runEvery]
  if (!freq) return false
  if (!project.lastRun) return true
  return now.getTime() - new Date(project.lastRun).getTime() >= freq
}

export function getTypePolicy(tipo: ProjectType, typePolicies: TypePolicy[]): PolicyStep[] {
  return typePolicies.find(p => p.tipo === tipo)?.steps ?? []
}

export async function runScheduler(
  config: TavernaConfig,
  typePolicies: TypePolicy[],
  opts: SchedulerOptions = {},
): Promise<void> {
  const tickMs = opts.tickMs ?? 60_000
  const maxTicks = opts.maxTicks ?? Infinity
  let ticks = 0

  while (ticks < maxTicks) {
    const now = new Date()
    const vault = await scanVault(config)

    for (const project of vault.projects) {
      if (!isProjectDue(project, now)) continue

      const typeSteps = getTypePolicy(project.tipo, typePolicies)
      const projectPolicy = readProjectPolicy(project.raw)
      const steps = mergePolicy(typeSteps, projectPolicy)
      const eligibleSteps = steps.filter(s => isAtSatisfied(s.at, now))

      if (eligibleSteps.length === 0) continue

      if (opts.dryRun) {
        for (const step of eligibleSteps) {
          console.log(`[dry-run] ${project.id} (${project.tipo}) → ${step.agent}${step.at ? ` at ${step.at}` : ''}`)
        }
        continue
      }

      let anySuccess = false
      for (const step of eligibleSteps) {
        const agent = vault.agents.find(
          a => a.id === step.agent || a.folderName === step.agent || `@${a.folderName}` === step.agent,
        )
        if (!agent) {
          console.error(`  skip ${project.id}: agent ${step.agent} not found`)
          continue
        }

        const result = await runAgent(agent, project, { vaultPath: config.vaultPath })
        anySuccess = anySuccess || result.success

        await appendLogbook(agent.id, {
          projectName: project.id,
          content: [
            `**Success:** ${result.success}`,
            `**Duration:** ${(result.durationMs / 1000).toFixed(1)}s`,
            ...(result.resultado ? [`**Resultado:** ${result.resultado}`] : []),
            ...(result.error ? [`**Error:** ${result.error}`] : []),
          ].join('\n'),
          success: result.success,
          duration: result.durationMs / 1000,
        }, config)
      }

      await updateProjectStatus(project.filePath, {
        ...(anySuccess ? { lastRun: now.toISOString() } : {}),
        lastStatus: anySuccess ? 'success' : 'failed',
        runsTotal: project.runsTotal + eligibleSteps.length,
      })
    }

    ticks++
    opts.onTick?.(now)

    if (ticks < maxTicks) {
      await new Promise<void>(resolve => setTimeout(resolve, tickMs))
    }
  }
}
