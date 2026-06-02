import type { TavernaConfig } from '../config.js'
import type { VaultState } from '../vault/types.js'
import type { NotificationBus } from '../notifications/bus.js'
import type { ZodRawShape } from '../commands/types.js'
import { allCommands } from '../commands/index.js'

/** Context passed to every feature handler. */
export interface FeatureContext {
  vaultPath: string
  config: TavernaConfig
  notificationBus: NotificationBus
  /** Optional cached scanner — HTTP server passes cache.get, MCP calls scanVault directly */
  scan?: () => Promise<VaultState>
}

export interface FeatureDef {
  name: string
  description: string
  params: ZodRawShape
  httpMethod: 'GET' | 'POST'
  httpPath: string
  handler: (params: Record<string, unknown>, ctx: FeatureContext) => Promise<unknown>
}

/** All HTTP-exposed commands mapped to FeatureDef format. */
export const features: FeatureDef[] = allCommands
  .filter((c) => c.http !== undefined)
  .map((c) => ({
    name: c.id,
    description: c.description,
    params: c.params ?? {},
    httpMethod: c.http!.method,
    httpPath: c.http!.path,
    handler: c.handler,
  }))

export const featureMap = new Map<string, FeatureDef>(features.map((f) => [f.name, f]))
