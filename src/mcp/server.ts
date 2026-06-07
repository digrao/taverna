import { createRequire } from 'node:module'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import { coreCommands } from '../core/index.js'
import type { RegisteredCommand, TavernaContext } from '../core/types.js'

const _req = createRequire(import.meta.url)
const { version } = _req('../../package.json') as { version: string }

/** `taverna_<id>` for core commands, `taverna_<namespace>_<id>` for plugin commands. */
function toolName(cmd: RegisteredCommand): string {
  return cmd.namespace !== undefined ? `taverna_${cmd.namespace}_${cmd.id}` : `taverna_${cmd.id}`
}

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

function err(message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  }
}

/**
 * Builds an MCP server exposing every command published on the 'mcp' protocol as a
 * `taverna_<...>` tool — the schema is derived straight from `CommandDef.params`.
 * Shared by stdio (`taverna mcp`) and HTTP SSE (`/mcp/sse`) — same tools, no duplicated logic.
 */
export function createMcpServer(ctx: TavernaContext): Server {
  const server = new Server({ name: 'taverna', version }, { capabilities: { tools: {} } })

  const tools = coreCommands.listFor('mcp')
  const byName = new Map(tools.map((cmd) => [toolName(cmd), cmd]))

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.map(
      (cmd): Tool => ({
        name: toolName(cmd),
        description: cmd.description,
        inputSchema: (cmd.params ?? { type: 'object', properties: {} }) as Tool['inputSchema'],
      }),
    ),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const cmd = byName.get(request.params.name)
    if (!cmd) return err(`Unknown tool: ${request.params.name}`)

    const result = await coreCommands.execute(
      cmd.namespace,
      cmd.id,
      request.params.arguments ?? {},
      ctx,
    )
    return result.error !== undefined ? err(result.error) : ok(result.data)
  })

  return server
}
