export type { TavernaContext, CommandDef, ZodRawShape } from './types.js'

// HTTP + CLI commands (exposed via all transports)
export { stateCommands } from './state.js'
export { projectsCommands } from './projects.js'
export { inboxCommands } from './inbox.js'
export { backlinksCommands } from './backlinks.js'
export { sessionCommands } from './session.js'
export { runCommands } from './run.js'
export { promptCommands } from './prompt.js'

// CLI-only helpers (no HTTP registration)
export { snapshotCommands } from './snapshot.js'
export { executeRun } from './run.js'
export { executeSessionRun } from './session.js'
export { generateReport } from './report.js'
export { generatePlan } from './plan.js'
export { showPolicy } from './policy.js'
export { showTaskStatus } from './status-cmd.js'
export { archiveTask } from './archive.js'
export { emitInsights } from './insights.js'
export { runWork } from './work.js'

import { stateCommands } from './state.js'
import { projectsCommands } from './projects.js'
import { inboxCommands } from './inbox.js'
import { backlinksCommands } from './backlinks.js'
import { sessionCommands } from './session.js'
import { runCommands } from './run.js'
import { promptCommands } from './prompt.js'
import { snapshotCommands } from './snapshot.js'
import type { CommandDef } from './types.js'

/** All commands — CLI + HTTP/MCP.
 * Commands with `http` are registered as API endpoints and MCP tools.
 * Commands without `http` are CLI-only. */
export const allCommands: CommandDef[] = [
  ...stateCommands,
  ...projectsCommands,
  ...inboxCommands,
  ...backlinksCommands,
  ...sessionCommands,
  ...runCommands,
  ...promptCommands,
  ...snapshotCommands,
]
