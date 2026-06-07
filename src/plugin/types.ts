import type { IncomingMessage, ServerResponse } from 'node:http'
import type { CommandDef } from '../core/types.js'
import type { NotificationBus } from '../notifications/bus.js'
import type { TavernaConfig } from '../config.js'

/** Raw HTTP route for non-JSON content (dashboards, slides, assets) — path is free, no namespace. */
export interface HttpRoute {
  method: 'GET' | 'POST'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse, path: string) => Promise<void>
}

/** Same shape as a core CommandDef — registered under the plugin's namespace. */
export type PluginCommand = CommandDef

export interface PluginContext {
  config: TavernaConfig
  notificationBus: NotificationBus
}

/**
 * Contract a plugin implements to extend taverna. The namespace prefixes every
 * generated interface (HTTP `/api/<namespace>/<id>`, CLI `taverna <namespace> <id>`,
 * MCP `taverna_<namespace>_<id>`) — the plugin never declares these itself.
 */
export interface TavernaPlugin {
  /** Convention: "taverna-<namespace>" */
  name: string
  /** Overrides the namespace derived from `name` */
  namespace?: string

  commands?: PluginCommand[]
  httpRoutes?: HttpRoute[]

  onLoad?: (ctx: PluginContext) => void
}
