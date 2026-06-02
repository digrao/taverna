export type { TavernaContext, CommandDef, CommandResult, ZodRawShape } from './types.js'
export { CommandRegistry } from './types.js'

export {
  getState,
  getCosts,
  getBudget,
  getActive,
  getRecentRuns,
  monitoringCommands,
} from './monitoring.js'
export {
  getProjects,
  getProject,
  getAgents,
  previewSessions,
  projectsCommands,
} from './projects.js'
export { getInboxItems, inboxCommands } from './inbox.js'
export { getBacklinks, backlinksCommands } from './backlinks.js'
export {
  executeRun,
  executeSessionRun,
  runWork,
  dryRunSession,
  executionCommands,
} from './execution.js'
export { archiveTask, getTaskStatus, tasksCommands } from './tasks.js'

import { monitoringCommands } from './monitoring.js'
import { projectsCommands } from './projects.js'
import { inboxCommands } from './inbox.js'
import { backlinksCommands } from './backlinks.js'
import { executionCommands } from './execution.js'
import { tasksCommands } from './tasks.js'
import type { CommandDef } from './types.js'

/** All commands — registered across HTTP, MCP, and CLI.
 * Commands with `http` are auto-registered as HTTP endpoints and MCP tools. */
export const allCommands: CommandDef[] = [
  // Observability — Grafana consumes these via JSON API
  ...monitoringCommands,

  // Vault reading — projects, agents, task state
  ...projectsCommands,

  // Human queue
  ...inboxCommands,

  // Vault graph navigation
  ...backlinksCommands,

  // Execution triggers (HTTP fire-and-forget) + session
  ...executionCommands,

  // Task operations
  ...tasksCommands,
]
