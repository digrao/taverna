import { hostname as osHostname } from 'node:os'
import type { TavernaConfig } from '../config.js'
import type { VaultProject } from '../vault/types.js'
import { scanVault } from '../vault/index.js'
import { deferred } from './loki.js'
import { rankProjects } from './scorer.js'
import { isRunWindowOpen } from './run-window.js'
import {
  isProjectDue,
  readProjectPolicy,
  mergePolicy,
  isAtSatisfied,
  getTypePolicy,
} from './policies.js'
import type { TypePolicy } from './policies.js'
import { drainProject } from './execute.js'
import { planSession, hasRunnableTasks } from './session-planner.js'
import type { TavernaPlugin } from '../plugin/types.js'
import type { FeatureContext } from '../infra/feature-map.js'

export interface SchedulerOptions {
  dryRun?: boolean
  /** Tick interval in ms (default: 60_000) */
  tickMs?: number
  /** Stop after N ticks — omit for infinite daemon */
  maxTicks?: number
  /** Max agent iterations per project per tick (1 = single task, N = drain) */
  maxTasksPerProject?: number
  /** Max projects to dispatch per tick */
  runBatchSize?: number
  /** Max concurrent runs per agent id within a tick */
  maxConcurrentPerAgent?: Record<string, number>
  onTick?: (now: Date) => void
}

/**
 * Core scheduling loop. Each tick:
 *  1. Calls plugin.beforeTick() on all plugins
 *  2. Scans vault and filters eligible projects via isProjectDue + run window + policy
 *  3. Ranks eligible projects by score (deadline, priority, health, staleness)
 *  4. Dispatches agents respecting batch size and per-agent concurrency limits
 *  5. Calls plugin.afterRun() after each run
 */
export async function runScheduler(
  config: TavernaConfig,
  typePolicies: TypePolicy[],
  plugins: TavernaPlugin[],
  opts: SchedulerOptions = {},
): Promise<void> {
  const tickMs = opts.tickMs ?? 60_000
  const maxTicks = opts.maxTicks ?? Infinity
  const maxTasksPerProject = opts.maxTasksPerProject ?? 1
  const runBatchSize = opts.runBatchSize ?? Infinity
  const maxConcurrentPerAgent = opts.maxConcurrentPerAgent ?? {}

  const ctx: FeatureContext = { vaultPath: config.vaultPath, config }

  let ticks = 0
  while (ticks < maxTicks) {
    const now = new Date()

    // ── Plugin beforeTick ──────────────────────────────────────────────────
    if (!opts.dryRun) {
      for (const plugin of plugins) {
        try {
          await plugin.beforeTick?.(ctx)
        } catch (e) {
          process.stderr.write(
            `[scheduler] plugin ${plugin.name} beforeTick error: ${e instanceof Error ? e.message : String(e)}\n`,
          )
        }
      }
    }

    // ── Scan + filter eligible projects ───────────────────────────────────
    const vault = await scanVault(config)
    const eligible: VaultProject[] = []

    for (const project of vault.projects) {
      if (!isProjectDue(project, now)) continue

      // hostname affinity — skip if project is pinned to a different host
      const projectHost =
        typeof project.raw['hostname'] === 'string' ? project.raw['hostname'] : undefined
      if (projectHost && projectHost !== osHostname()) continue

      // run window check
      const runWindow =
        typeof project.raw['run_window'] === 'string'
          ? project.raw['run_window']
          : (config.defaultRunWindow ?? 'always')
      const windowResult = isRunWindowOpen(runWindow, now)
      if (!windowResult.open) {
        deferred({
          project: project.id,
          reason: windowResult.reason ?? 'run_window',
          ...(windowResult.nextEligibleAt != null
            ? { next_eligible_at: windowResult.nextEligibleAt }
            : {}),
        })
        continue
      }

      // policy at-constraint check — at least one step must be eligible right now
      const typeSteps = getTypePolicy(project.tipo, typePolicies)
      const projectPolicy = readProjectPolicy(project.raw)
      const steps = mergePolicy(typeSteps, projectPolicy)
      if (steps.filter((s) => isAtSatisfied(s.at, now)).length === 0) continue

      // task dep resolution — skip projects with no runnable tasks
      if (!hasRunnableTasks(project)) {
        deferred({ project: project.id, reason: 'all_tasks_blocked' })
        continue
      }

      eligible.push(project)
    }

    // ── Rank and dispatch ─────────────────────────────────────────────────
    const ranked = rankProjects(eligible, config.agentDefaults, { now })

    const agentRunCount: Record<string, number> = {}
    let batchCount = 0

    for (const { project, agentId } of ranked) {
      if (batchCount >= runBatchSize) break

      const concurrencyLimit = maxConcurrentPerAgent[agentId]
      if (concurrencyLimit !== undefined && (agentRunCount[agentId] ?? 0) >= concurrencyLimit) {
        if (opts.dryRun) {
          console.log(
            `[dry-run] ${project.id} → ${agentId} SKIPPED (agent limit ${concurrencyLimit} reached)`,
          )
        }
        continue
      }

      const typeSteps = getTypePolicy(project.tipo, typePolicies)
      const projectPolicy = readProjectPolicy(project.raw)
      const steps = mergePolicy(typeSteps, projectPolicy)
      const eligibleSteps = steps.filter((s) => isAtSatisfied(s.at, now))

      if (opts.dryRun) {
        const plan = planSession(project, maxTasksPerProject)
        const score = ranked.find((r) => r.project.id === project.id)?.score ?? '?'
        for (const step of eligibleSteps) {
          const at = step.at ? ` at ${step.at}` : ''
          console.log(
            `[dry-run] ${project.id} (${project.tipo}, score=${score}) → ${step.agent}${at}`,
          )
          for (const t of plan.runnable) {
            const dl = t.deadline ? `  deadline:${t.deadline}` : ''
            console.log(`  ✓ ${t.id} [${t.prioridade}]${dl}  ${t.title}`)
          }
          if (plan.blocked.length > 0) {
            for (const b of plan.blocked) {
              console.log(`  ✗ ${b.task.id} — blocked by: ${b.blockedBy.join(', ')}`)
            }
          }
          if (plan.awaitingHuman.length > 0) {
            for (const t of plan.awaitingHuman) {
              console.log(`  👤 ${t.id} — awaiting human`)
            }
          }
        }
        agentRunCount[agentId] = (agentRunCount[agentId] ?? 0) + 1
        batchCount++
        continue
      }

      for (const step of eligibleSteps) {
        const agent = vault.agents.find(
          (a) =>
            a.id === step.agent || a.folderName === step.agent || `@${a.folderName}` === step.agent,
        )
        if (!agent) {
          console.error(`  skip ${project.id}: agent ${step.agent} not found`)
          continue
        }

        console.log(
          `\n${project.id} → ${agent.id}${maxTasksPerProject > 1 ? ` (drain ≤${maxTasksPerProject} tasks)` : ''}`,
        )

        await drainProject(
          agent,
          project,
          maxTasksPerProject,
          {},
          config,
          false,
          async (result, proj) => {
            for (const plugin of plugins) {
              try {
                await plugin.afterRun?.(result, proj, ctx)
              } catch (e) {
                process.stderr.write(
                  `[scheduler] plugin ${plugin.name} afterRun error: ${e instanceof Error ? e.message : String(e)}\n`,
                )
              }
            }
          },
        )
      }

      agentRunCount[agentId] = (agentRunCount[agentId] ?? 0) + 1
      batchCount++
    }

    ticks++
    opts.onTick?.(now)

    if (ticks < maxTicks) {
      await new Promise<void>((resolve) => setTimeout(resolve, tickMs))
    }
  }
}
