import type { VaultAgent, VaultProject, VaultTask } from '../../vault/types.js'
import type { ScoredProject, ScoreContext } from './scorer.js'
import type { TriageResult } from './triage.js'
import type { ResolvedPolicy } from './policy-resolver.js'

/** Override the default project scoring and ranking algorithm. */
export interface ScoringPlugin {
  score(project: VaultProject, agentId: string, ctx: ScoreContext): ScoredProject
  rank(
    projects: VaultProject[],
    agentDefaults: Record<string, string>,
    ctx: ScoreContext,
  ): ScoredProject[]
}

/** Override the default task triage (filter + classify runnable tasks). */
export interface TriagePlugin {
  triage(tasks: VaultTask[], project: VaultProject): TriageResult
}

/** Override the default tool permission resolution for an agent+project pair. */
export interface PermissionPlugin {
  resolve(agent: VaultAgent, project: VaultProject): ResolvedPolicy
}

/** All scheduling behaviours that can be replaced via plugins. */
export interface SchedulingPlugins {
  scoring?: ScoringPlugin
  triage?: TriagePlugin
  permissions?: PermissionPlugin
}
