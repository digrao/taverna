export type {
  TavernaContext,
  CommandDef,
  CommandContext,
  CommandResult,
  ZodRawShape,
} from './types.js'
export { CommandRegistry } from './types.js'

// HTTP + CLI commands (exposed via all transports)
export { stateCommands } from './state.js'
export { projectsCommands } from './projects.js'
export { inboxCommands } from './inbox.js'
export { backlinksCommands } from './backlinks.js'
export { sessionCommands } from './session.js'
export { runCommands } from './run.js'
export { promptCommands } from './prompt.js'

// CLI commands (no HTTP registration)
export { snapshotCommands } from './snapshot.js'
export { workCommands } from './work.js'
export { reportCommands } from './report.js'
export { planCommands } from './plan.js'
export { archiveCommands } from './archive.js'
export { insightsCommands } from './insights.js'
export { policyCommands } from './policy.js'
export { statusCommands } from './status-cmd.js'
export { syncCommands } from './sync.js'

// CLI helpers (direct function exports, called by cli.ts)
export { executeRun } from './run.js'
export { executeSessionRun } from './session.js'
export { generateReport } from './report.js'
export { generateAgenda } from './plan.js'
export { showPolicy } from './policy.js'
export { showTaskStatus } from './status-cmd.js'
export { archiveTask } from './archive.js'
export { emitDigest } from './insights.js'
export { runWork } from './work.js'
export { runSync } from './sync.js'

import { stateCommands } from './state.js'
import { projectsCommands } from './projects.js'
import { inboxCommands } from './inbox.js'
import { backlinksCommands } from './backlinks.js'
import { sessionCommands } from './session.js'
import { runCommands } from './run.js'
import { promptCommands } from './prompt.js'
import { snapshotCommands } from './snapshot.js'
import { workCommands } from './work.js'
import { reportCommands } from './report.js'
import { planCommands } from './plan.js'
import { archiveCommands } from './archive.js'
import { insightsCommands } from './insights.js'
import { policyCommands } from './policy.js'
import { statusCommands } from './status-cmd.js'
import { syncCommands } from './sync.js'
import type { CommandDef } from './types.js'

/** All commands.
 * Commands with `http` are registered as HTTP endpoints and MCP tools.
 * Commands without `http` are CLI-only. */
export const allCommands: CommandDef[] = [
  // Monitoring & introspection (HTTP + CLI)
  ...stateCommands,
  ...projectsCommands,
  ...inboxCommands,
  ...backlinksCommands,
  ...promptCommands,

  // Execution triggers (HTTP fire-and-forget + CLI direct)
  ...sessionCommands,
  ...runCommands,

  // CLI-only
  ...snapshotCommands,
  ...workCommands,
  ...reportCommands,
  ...planCommands,
  ...archiveCommands,
  ...insightsCommands,
  ...policyCommands,
  ...statusCommands,
  ...syncCommands,
]
