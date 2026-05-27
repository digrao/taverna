/**
 * MCP Server Integration Pattern
 *
 * Shows how to refactor src/mcp/server.ts to use Command Handler.
 * This is a TEMPLATE — não modifica mcp/server.ts ainda.
 *
 * Padrão:
 *   Old: server.tool('taverna_state', () => { /* HTTP call + format * / })
 *   New: server.tool('taverna_state', () => executeCommand('state', ...))
 */

import { z } from 'zod'
import { executeCommand } from '../core/server-api.js'
import type { CommandContext } from '../core/command-handler.js'

/** Result formatter for MCP */
function formatMcpResult(result: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  }
}

/**
 * Example tool registration:
 *
 * // OLD (em mcp/server.ts):
 * server.tool('taverna_state', 'Show project states', {}, async () => {
 *   const res = await fetch('http://localhost:2948/api/state')
 *   const data = await res.json()
 *   return formatMcpResult(data)
 * })
 *
 * // NEW (em mcp/server.ts):
 * server.tool('taverna_state', 'Show project states', {}, async () => {
 *   const ctx: CommandContext = {
 *     config: tavernaConfig,
 *     vaultPath: process.env.VAULT_PATH!,
 *   }
 *   const result = await executeCommand('state', { tipo: undefined }, ctx)
 *   return formatMcpResult(result)
 * })
 */

/**
 * Template helper para registrar um tool MCP:
 */
export function registerMcpTool(
  server: any,
  toolId: string,
  description: string,
  schema: Record<string, z.ZodType>,
  commandId: string,
  ctx: CommandContext,
) {
  server.tool(toolId, description, schema, async (args: Record<string, unknown>) => {
    const result = await executeCommand(commandId, args, ctx)
    return formatMcpResult(result)
  })
}
