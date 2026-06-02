import { emitEvent } from './event-bus.js'
import type { VaultProject } from '../../vault/types.js'

export type LogStatus = 'success' | 'failed'
export type HealthStatus = 'ok' | 'at-risk' | 'overdue' | 'idle'

export interface AgentRunPayload {
  event: 'agent_run'
  project: string
  agent: string
  status: LogStatus
  duration_s: number
  tokens_in?: number
  tokens_out?: number
  cache_read?: number
  cache_fill?: number
  cost_usd?: number
  cache_hit_pct?: number
  [key: string]: unknown
}

export interface ProjectSnapshotPayload {
  event: 'project_snapshot'
  project: string
  tipo: string
  priority: string
  tasks_total: number
  tasks_done: number
  progresso: number
  health: HealthStatus
  deadline_days?: number
  deepwork_total_h?: number
  deepwork_week_h?: number
  [key: string]: unknown
}

export interface AgentDeferredPayload {
  event: 'agent_deferred'
  project: string
  reason: 'run_window' | 'claude_active'
  next_eligible_at?: string
  [key: string]: unknown
}

export function log(payload: AgentRunPayload): void {
  emitEvent(payload)
}

export function deferred(payload: Omit<AgentDeferredPayload, 'event'>): void {
  emitEvent({ event: 'agent_deferred', ...payload })
}

const FREQ_MS: Record<string, number> = {
  hourly: 3_600_000,
  daily: 86_400_000,
  weekly: 604_800_000,
  monthly: 2_592_000_000,
}

export function computeHealth(
  project: VaultProject,
  opts?: { now?: Date },
): ProjectSnapshotPayload {
  const pending = project.tasks.filter((t) => t.progresso < 100)
  const tasks_total = project.tasks.length
  const tasks_done = project.tasks.filter((t) => t.progresso === 100).length
  const progresso =
    tasks_total === 0
      ? 0
      : Math.round(project.tasks.reduce((s, t) => s + t.progresso, 0) / tasks_total)

  // Find nearest deadline among pending tasks
  let deadline_days: number | undefined
  const now = opts?.now ? opts.now.getTime() : Date.now()
  for (const task of pending) {
    if (!task.deadline) continue
    const d = new Date(task.deadline).getTime()
    if (isNaN(d)) continue
    const days = Math.floor((d - now) / 86_400_000)
    if (deadline_days === undefined || days < deadline_days) deadline_days = days
  }

  let health: HealthStatus = 'ok'
  if (tasks_total === 0) {
    health = 'idle'
  } else if (deadline_days !== undefined && deadline_days < 0) {
    health = 'overdue'
  } else if (deadline_days !== undefined && deadline_days < 7) {
    health = 'at-risk'
  }

  // Time until next scheduled run (negative = overdue/due now)
  let next_run_in_s: number | undefined
  if (project.runEvery !== 'never') {
    const freq = FREQ_MS[project.runEvery]
    if (freq) {
      const lastMs = project.lastRun ? new Date(project.lastRun).getTime() : 0
      next_run_in_s = Math.round((lastMs + freq - now) / 1000)
    }
  }

  const deepwork_total_h =
    typeof project.raw['deepwork_total_h'] === 'number'
      ? project.raw['deepwork_total_h']
      : undefined
  const deepwork_week_h =
    typeof project.raw['deepwork_week_h'] === 'number' ? project.raw['deepwork_week_h'] : undefined

  return {
    event: 'project_snapshot',
    project: project.id,
    tipo: project.tipo,
    priority: project.priority,
    tasks_total,
    tasks_done,
    progresso,
    health,
    ...(deadline_days !== undefined ? { deadline_days } : {}),
    ...(next_run_in_s !== undefined ? { next_run_in_s } : {}),
    ...(deepwork_total_h !== undefined ? { deepwork_total_h } : {}),
    ...(deepwork_week_h !== undefined ? { deepwork_week_h } : {}),
  }
}

export function snapshot(project: VaultProject): void {
  emitEvent(computeHealth(project))
}
