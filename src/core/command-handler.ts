/**
 * Unified Command Handler — Single source of truth for all taverna operations.
 *
 * This is the core orchestrator. All actions (CLI/HTTP/MCP) route through here.
 * Pattern:
 *   - Define a command with its handler
 *   - CLI calls handler directly
 *   - HTTP/MCP wrappers call handler and format output
 *
 * Handler contract: async (args, context) => { data?, error?, success }
 */

import type { TavernaConfig } from '../config.js'

export interface CommandContext {
  config: TavernaConfig
  dryRun?: boolean
  vaultPath: string
}

export interface CommandResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
  metadata?: {
    durationMs?: number
    itemsProcessed?: number
  }
}

export type CommandHandler<TArgs = Record<string, unknown>, TResult = unknown> = (
  args: TArgs,
  ctx: CommandContext,
) => Promise<CommandResult<TResult>>

export interface CommandDefinition {
  id: string
  description: string
  handler: CommandHandler
}

/** Registry of all available commands */
export class CommandRegistry {
  private commands = new Map<string, CommandDefinition>()

  register(def: CommandDefinition): void {
    this.commands.set(def.id, def)
  }

  get(id: string): CommandDefinition | undefined {
    return this.commands.get(id)
  }

  list(): CommandDefinition[] {
    return Array.from(this.commands.values())
  }

  async execute<TArgs, TResult>(
    id: string,
    args: TArgs,
    ctx: CommandContext,
  ): Promise<CommandResult<TResult>> {
    const cmd = this.get(id)
    if (!cmd) {
      return {
        success: false,
        error: `Command not found: ${id}`,
      }
    }

    try {
      const startMs = Date.now()
      const result = await (cmd.handler as CommandHandler<TArgs, TResult>)(args, ctx)
      result.metadata = {
        ...result.metadata,
        durationMs: Date.now() - startMs,
      }
      return result
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }
}

// Global registry — initialized by CLI bootstrap
export let defaultRegistry: CommandRegistry

export function setCommandRegistry(reg: CommandRegistry): void {
  defaultRegistry = reg
}
