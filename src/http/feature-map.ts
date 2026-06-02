import type { CommandDef, TavernaContext } from '../core/types.js'
import { allCommands } from '../core/index.js'

export type { CommandDef, TavernaContext }

/** HTTP-exposed subset of allCommands — auto-registered as routes and MCP tools. */
export const features = allCommands.filter(
  (c): c is CommandDef & { http: NonNullable<CommandDef['http']> } => c.http !== undefined,
)

export const featureMap = new Map(features.map((f) => [f.id, f]))
