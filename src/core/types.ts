import type { z } from 'zod'
import type { TavernaConfig } from '../config.js'
import type { NotificationBus } from '../notifications/bus.js'
import type { VaultState } from '../vault/types.js'

export interface TavernaContext {
  config: TavernaConfig
  vaultPath: string
  dryRun?: boolean
  notificationBus?: NotificationBus
  scan?: () => Promise<VaultState>
}

export type ZodRawShape = Record<string, z.ZodTypeAny>

export interface CommandDef {
  id: string
  description: string
  params?: ZodRawShape
  handler: (params: Record<string, unknown>, ctx: TavernaContext) => Promise<unknown>
  /** Expose via HTTP and MCP. Omit for CLI-only commands. */
  http?: { method: 'GET' | 'POST'; path: string }
}

export interface CommandResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
  metadata?: { durationMs?: number; itemsProcessed?: number }
}

export class CommandRegistry {
  private commands = new Map<string, CommandDef>()

  register(def: CommandDef): void {
    this.commands.set(def.id, def)
  }

  get(id: string): CommandDef | undefined {
    return this.commands.get(id)
  }

  list(): CommandDef[] {
    return Array.from(this.commands.values())
  }

  async execute<T = unknown>(
    id: string,
    args: Record<string, unknown>,
    ctx: TavernaContext,
  ): Promise<CommandResult<T>> {
    const cmd = this.get(id)
    if (!cmd) return { success: false, error: `Command not found: ${id}` }
    try {
      const startMs = Date.now()
      const result = (await cmd.handler(args, ctx)) as CommandResult<T>
      result.metadata = { ...result.metadata, durationMs: Date.now() - startMs }
      return result
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
}
