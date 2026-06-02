import type { VaultProject, VaultTask, Priority } from '../../vault/types.js'
import { isBlocked } from '../../vault/task.js'
import type { TriagePlugin } from './plugins.js'

export interface TaskPlan {
  task: VaultTask
  blockedBy: string[] // empty = runnable
}

export interface SessionPlan {
  project: VaultProject
  /** Ordered runnable tasks for this session */
  runnable: VaultTask[]
  /** Tasks that cannot run yet (unresolved deps or external bloqueio) */
  blocked: TaskPlan[]
  /** Tasks awaiting human action */
  awaitingHuman: VaultTask[]
}

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

function sortTasks(tasks: VaultTask[]): VaultTask[] {
  return [...tasks].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.prioridade] ?? 2
    const pb = PRIORITY_ORDER[b.prioridade] ?? 2
    if (pa !== pb) return pa - pb
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline)
    if (a.deadline) return -1
    if (b.deadline) return 1
    return 0
  })
}

/**
 * Resolve task dependency graph for a single project.
 *
 * Returns runnable tasks (sorted by priority → deadline), blocked tasks with
 * their blocker IDs, and tasks awaiting human input.
 */
export function planSession(
  project: VaultProject,
  maxTasks = Infinity,
  triagePlugin?: TriagePlugin,
): SessionPlan {
  const pending = project.tasks.filter((t) => t.progresso < 100)

  if (triagePlugin) {
    const result = triagePlugin.triage(pending, project)
    return {
      project,
      runnable: sortTasks(result.runnable).slice(0, maxTasks),
      blocked: result.skipped.map((e) => ({ task: e.task, blockedBy: [e.reason] })),
      awaitingHuman: [],
    }
  }

  const runnable: VaultTask[] = []
  const blocked: TaskPlan[] = []
  const awaitingHuman: VaultTask[] = []

  for (const task of pending) {
    const humanBlocked =
      task.assignee === 'human' ||
      task.bloqueio ||
      (task.requerHumano && task.requerHumano.length > 0)
    if (humanBlocked) {
      awaitingHuman.push(task)
      continue
    }

    const info = isBlocked(task, project.tasks)
    if (info.blocked) {
      blocked.push({ task, blockedBy: info.blockedBy })
    } else {
      runnable.push(task)
    }
  }

  return {
    project,
    runnable: sortTasks(runnable).slice(0, maxTasks),
    blocked,
    awaitingHuman,
  }
}

/**
 * Plan sessions for a list of eligible projects.
 * Projects with no runnable tasks (all blocked or idle) are excluded.
 */
export function planSessions(
  projects: VaultProject[],
  maxTasksPerProject = Infinity,
): SessionPlan[] {
  return projects
    .map((p) => planSession(p, maxTasksPerProject))
    .filter((s) => s.runnable.length > 0)
}

/** Returns true if a project has at least one task that can run right now. */
export function hasRunnableTasks(project: VaultProject): boolean {
  const pending = project.tasks.filter((t) => t.progresso < 100)
  return pending.some(
    (t) =>
      t.assignee !== 'human' &&
      !t.bloqueio &&
      !(t.requerHumano && t.requerHumano.length > 0) &&
      !isBlocked(t, project.tasks).blocked,
  )
}
