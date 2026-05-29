import type { TavernaConfig } from '../config.js'
import type { VaultProject, ProjectType, RawFrontmatter } from '../vault/types.js'
import { getString } from '../vault/frontmatter.js'

export type ComposeMode = 'inherit' | 'override'

export interface PolicyStep {
  agent: string
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

const FREQ_MS: Record<string, number> = {
  hourly: 3_600_000,
  daily: 86_400_000,
  weekly: 604_800_000,
  monthly: 2_592_000_000,
}

export function isProjectDue(project: VaultProject, now: Date): boolean {
  if (project.runEvery === 'never') return false
  const freq = FREQ_MS[project.runEvery]
  if (!freq) return false
  if (!project.lastRun) return true
  return now.getTime() - new Date(project.lastRun).getTime() >= freq
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

export function mergePolicy(typeSteps: PolicyStep[], projectPolicy?: ProjectPolicy): PolicyStep[] {
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

export function getTypePolicy(tipo: ProjectType, typePolicies: TypePolicy[]): PolicyStep[] {
  return typePolicies.find((p) => p.tipo === tipo)?.steps ?? []
}

export function defaultTypePolicies(config: TavernaConfig): TypePolicy[] {
  return [
    {
      tipo: 'USP',
      steps: [
        { agent: config.agentDefaults['USP'] ?? '@study-assistant', at: '09:00' },
        { agent: config.agentDefaults['USP'] ?? '@study-assistant', at: 'EOD' },
        { agent: config.agentDefaults['USP'] ?? '@study-assistant' },
      ],
    },
    {
      tipo: 'BB',
      steps: [{ agent: config.agentDefaults['BB'] ?? '@planner' }],
    },
    {
      tipo: '*',
      steps: [{ agent: config.agentDefaults['*'] ?? '@dev-agent' }],
    },
  ]
}
