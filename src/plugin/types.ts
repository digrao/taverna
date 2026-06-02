import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Command } from 'commander'
import type { CommandDef, TavernaContext } from '../core/types.js'
import type { NotificationBus } from '../notifications/bus.js'
import type { AgentResult } from '../manager/engine/index.js'
import type { VaultProject } from '../vault/types.js'
import type { SchedulingPlugins } from '../manager/scheduling/plugins.js'

export interface HttpRoute {
  method: 'GET' | 'POST'
  /** Exact path or prefix ending with * (e.g. '/slides/*') */
  path: string
  handler: (req: IncomingMessage, res: ServerResponse, path: string) => Promise<void>
}

/**
 * A taverna plugin contributes commands (HTTP + MCP), optional CLI commands,
 * and optional scheduler lifecycle hooks.
 *
 * Minimal plugin example:
 *
 *   export default {
 *     name: 'my-plugin',
 *     commands: [{
 *       id: 'ping', description: 'Health check', params: {},
 *       http: { method: 'GET', path: '/api/my-plugin/ping' },
 *       handler: async () => ({ ok: true }),
 *     }],
 *   } satisfies TavernaPlugin
 */
export interface TavernaPlugin {
  name: string

  /** Commands exposed as MCP tools and HTTP routes (when http is set). */
  commands?: CommandDef[]

  /** Raw HTTP routes for serving non-JSON content (HTML, assets). */
  httpRoutes?: HttpRoute[]

  /** Called once when the plugin is loaded. Use to register notification sinks. */
  onLoad?: (bus: NotificationBus) => void

  /** Optional CLI commands this plugin contributes. */
  registerCommands?: (program: Command, ctx: TavernaContext) => void

  /** Called once at the start of each scheduler tick, before vault scan. */
  beforeTick?: (ctx: TavernaContext) => Promise<void>

  /** Called after each agent run completes (not called in dry-run mode). */
  afterRun?: (result: AgentResult, project: VaultProject, ctx: TavernaContext) => Promise<void>

  /** Override scoring, triage, or permission resolution for the scheduler. */
  scheduling?: SchedulingPlugins
}
