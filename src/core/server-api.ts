/**
 * Unified Server Layer — thin HTTP/JSON wrapper around Command Handler.
 *
 * Before: server/routes.ts had all logic duplicated
 * After: just delegates to CommandRegistry
 *
 * Usage:
 *   const res = await serverApi.execute('run', { agent: '@dev-agent', project: 'taverna' })
 *   return JSON.stringify(res)
 */

import { defaultRegistry } from './command-handler.js'
import type { CommandContext } from './command-handler.js'

export async function executeCommand(
  commandId: string,
  args: Record<string, unknown>,
  ctx: CommandContext,
) {
  if (!defaultRegistry) {
    return {
      success: false,
      error: 'Command registry not initialized',
    }
  }

  return await defaultRegistry.execute(commandId, args, ctx)
}

/** List all available commands for discovery */
export function listCommands() {
  return (defaultRegistry?.list() ?? []).map((cmd) => ({
    id: cmd.id,
    description: cmd.description,
  }))
}
