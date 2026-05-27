import type { VaultProject, Priority } from '../vault/types.js'
import { computeHealth } from './loki.js'

export interface ScoreContext {
  now: Date
  /** tokens remaining today (from budget check) */
  budgetRemainingTokens?: number
}

export interface ScoreFactor {
  name: string
  points: number
  detail: string
}

export interface ScoredProject {
  project: VaultProject
  score: number
  factors: ScoreFactor[]
  agentId: string
  /** resolved from project.agent or agentDefaults */
}

const HEALTH_BONUS: Record<string, number> = {
  overdue: 40,
  'at-risk': 25,
  ok: 10,
  idle: 0,
}

const PRIORITY_BONUS: Record<Priority, number> = {
  high: 20,
  medium: 10,
  low: 0,
}

const ACTIVE_PIPELINE_STAGES = new Set([
  'building',
  'testing',
  'reviewing',
  'active',
  'em-progresso',
])

export function scoreProject(
  project: VaultProject,
  agentId: string,
  ctx: ScoreContext,
): ScoredProject {
  const factors: ScoreFactor[] = []
  let score = 0

  const health = computeHealth(project)

  // 1. Deadline urgency (highest weight)
  if (health.deadline_days !== undefined) {
    const pts = Math.min(100, Math.max(0, 100 - health.deadline_days * 10))
    factors.push({
      name: 'deadline',
      points: pts,
      detail: health.deadline_days <= 0 ? 'overdue' : `${health.deadline_days}d remaining`,
    })
    score += pts
  }

  // 2. Project-level priority
  const priorityPts = PRIORITY_BONUS[project.priority]
  if (priorityPts > 0) {
    factors.push({ name: 'priority', points: priorityPts, detail: project.priority })
    score += priorityPts
  }

  // 3. Health status
  const healthPts = HEALTH_BONUS[health.health] ?? 0
  if (healthPts > 0) {
    factors.push({ name: 'health', points: healthPts, detail: health.health })
    score += healthPts
  }

  // 4. Active tasks needing continuation (building/testing/reviewing)
  const activeTasks = project.tasks.filter(
    (t) => t.progresso < 100 && t.pipelineStage && ACTIVE_PIPELINE_STAGES.has(t.pipelineStage),
  )
  if (activeTasks.length > 0) {
    const pts = activeTasks.length * 8
    factors.push({ name: 'active_tasks', points: pts, detail: `${activeTasks.length} in-progress` })
    score += pts
  }

  // 5. Staleness (days since last run)
  if (project.lastRun) {
    const daysSince = Math.floor(
      (ctx.now.getTime() - new Date(project.lastRun).getTime()) / 86_400_000,
    )
    const pts = Math.min(daysSince * 5, 30)
    if (pts > 0) {
      factors.push({ name: 'stale', points: pts, detail: `${daysSince}d since last run` })
      score += pts
    }
  } else {
    // Never ran → max stale bonus
    factors.push({ name: 'stale', points: 30, detail: 'never ran' })
    score += 30
  }

  // 6. Deep work penalty (heavy recent usage → deprioritise slightly)
  const weekHours =
    typeof project.raw['deepwork_week_h'] === 'number'
      ? (project.raw['deepwork_week_h'] as number)
      : 0
  if (weekHours > 5) {
    const pts = -Math.floor((weekHours - 5) * 2)
    factors.push({ name: 'deepwork_penalty', points: pts, detail: `${weekHours}h this week` })
    score += pts
  }

  return { project, score, factors, agentId }
}

export function rankProjects(
  projects: VaultProject[],
  agentDefaults: Record<string, string>,
  ctx: ScoreContext,
): ScoredProject[] {
  return projects
    .map((p) => {
      const agentId = (p.agent ?? agentDefaults[p.tipo] ?? agentDefaults['*'] ?? '') as string
      return scoreProject(p, agentId, ctx)
    })
    .sort((a, b) => b.score - a.score)
}
