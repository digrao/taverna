import type { TavernaContext } from './types.js'
import { scanVault } from '../vault/index.js'
import {
  defaultTypePolicies,
  readProjectPolicy,
  mergePolicy,
  getTypePolicy,
} from '../pm/policies.js'
import { computeHealth } from '../pm/loki.js'
import { resolvePolicy } from '../pm/policy-resolver.js'
import type { VaultProject } from '../vault/types.js'

const FREQ_LABEL: Record<string, string> = {
  hourly: '1h',
  daily: '24h',
  weekly: '7d',
  monthly: '30d',
  never: 'never',
}
const FREQ_MS: Record<string, number> = {
  hourly: 3_600_000,
  daily: 86_400_000,
  weekly: 604_800_000,
  monthly: 2_592_000_000,
}

function fmtNextRun(project: VaultProject): string {
  if (project.runEvery === 'never') return 'nunca'
  const freq = FREQ_MS[project.runEvery]
  if (!freq) return '?'
  const lastMs = project.lastRun ? new Date(project.lastRun).getTime() : 0
  const nextMs = lastMs + freq
  const diffS = Math.round((nextMs - Date.now()) / 1000)
  if (diffS <= 0) return 'agora (overdue)'
  const h = Math.floor(diffS / 3600)
  if (h < 1) return `em ${Math.floor(diffS / 60)}min`
  if (h < 24) return `em ${h}h`
  return `em ${Math.floor(h / 24)}d`
}

export async function showPolicy(
  params: { projectId?: string; tipo?: string },
  ctx: TavernaContext,
): Promise<void> {
  const vault = await scanVault(ctx.config)
  const typePolicies = defaultTypePolicies(ctx.config)

  const projects = params.projectId
    ? vault.projects.filter((p) => p.id === params.projectId || p.name === params.projectId)
    : params.tipo
      ? vault.projects.filter((p) => p.tipo === params.tipo)
      : vault.projects

  if (projects.length === 0) {
    throw new Error(`No projects found${params.projectId ? ` for "${params.projectId}"` : ''}`)
  }

  const hr = '─'.repeat(52)

  for (const project of projects) {
    const typeSteps = getTypePolicy(project.tipo, typePolicies)
    const projectPolicy = readProjectPolicy(project.raw)
    const effectiveSteps = mergePolicy(typeSteps, projectPolicy)
    const snap = computeHealth(project)

    const composeMode = projectPolicy?.compose ?? 'inherit (default)'
    const hasOverride = projectPolicy !== undefined

    console.log(`\n${hr}`)
    console.log(
      `${project.id}  ·  tipo: ${project.tipo}  ·  priority: ${project.priority}  ·  runEvery: ${project.runEvery} (${FREQ_LABEL[project.runEvery] ?? '?'})`,
    )
    console.log(hr)

    console.log(`\nType policy (${project.tipo}):`)
    if (typeSteps.length === 0) {
      console.log('  (none)')
    } else {
      typeSteps.forEach((s, i) => {
        const at = s.at ? `  at ${s.at}` : '  (any time)'
        console.log(`  ${i + 1}  ${s.agent}${at}`)
      })
    }

    console.log(
      `\nProject overrides:  ${hasOverride ? `compose=${projectPolicy!.compose}` : 'none'}`,
    )
    if (hasOverride && projectPolicy!.steps.length > 0) {
      projectPolicy!.steps.forEach((s, i) => {
        const at = s.at ? `  at ${s.at}` : '  (any time)'
        console.log(`  ${i + 1}  ${s.agent}${at}`)
      })
    }

    console.log(`\nEffective steps:  (compose: ${composeMode})`)
    if (effectiveSteps.length === 0) {
      console.log('  (none — project will not run)')
    } else {
      effectiveSteps.forEach((s, i) => {
        const at = s.at ? `  at ${s.at}` : '  (any time, governed by runEvery)'
        console.log(`  ${i + 1}  ${s.agent}${at}`)
      })
    }

    console.log(`\nSchedule:`)
    console.log(
      `  Last run:    ${project.lastRun ? new Date(project.lastRun).toLocaleString('pt-BR') : 'never'} (${project.lastStatus ?? '—'})`,
    )
    console.log(`  Runs total:  ${project.runsTotal}`)
    console.log(`  Next run:    ${fmtNextRun(project)}`)

    console.log(`\nHealth:`)
    console.log(
      `  Tasks:       ${snap.tasks_done}/${snap.tasks_total} done  (progresso: ${snap.progresso}%)`,
    )
    if (snap.deadline_days !== undefined) {
      const dLabel =
        snap.deadline_days < 0
          ? `${Math.abs(snap.deadline_days)}d atrás`
          : snap.deadline_days === 0
            ? 'hoje'
            : `${snap.deadline_days}d`
      console.log(`  Deadline:    ${dLabel}`)
    }
    console.log(`  Status:      ${snap.health}`)

    const agentId = project.agent ?? effectiveSteps[0]?.agent
    const agent = agentId
      ? vault.agents.find(
          (a) => a.id === agentId || `@${a.folderName}` === agentId || a.folderName === agentId,
        )
      : undefined

    if (agent) {
      const perm = resolvePolicy(agent, project)
      console.log(`\nPermissions:  (agent: ${agent.id}  mode: ${perm.permissionMode})`)
      if (perm.permissionMode === 'bypassPermissions') {
        console.log(`  bypass — all tools allowed (add permissions: [] to directive to restrict)`)
      } else {
        if (perm.agentTools.length > 0) {
          console.log(`  agent directive:  ${perm.agentTools.join(', ')}`)
        }
        if (perm.inferredTools.length > 0) {
          console.log(
            `  inferred (${perm.inferredFrom ?? 'target'}):  ${perm.inferredTools.join(', ')}`,
          )
        }
        if (perm.allowedTools && perm.allowedTools.length > 0) {
          console.log(`  effective:        ${perm.allowedTools.join(', ')}`)
        } else {
          console.log(`  effective:        (none — agent will be blocked from all tools)`)
        }
      }
    }
  }
  console.log(`\n${hr}`)
}
