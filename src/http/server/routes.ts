import type { IncomingMessage, ServerResponse } from 'node:http'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import type { CommandRegistry, RegisteredCommand, TavernaContext } from '../../core/types.js'
import type { TavernaEvent } from '../../notifications/types.js'
import type { HttpRoute } from '../../plugin/types.js'
import { createMcpServer } from '../../mcp/server.js'

/** `get_*` commands read; everything else writes — derives the HTTP method from the id. */
function httpMethodFor(id: string): 'GET' | 'POST' {
  return id.startsWith('get_') ? 'GET' : 'POST'
}

function commandPath(cmd: RegisteredCommand): string {
  return cmd.namespace !== undefined ? `/api/${cmd.namespace}/${cmd.id}` : `/api/${cmd.id}`
}

/**
 * Thin HTTP adapter over the command registry — generates `/api/<id>` (core) and
 * `/api/<namespace>/<id>` (plugin) routes from `CommandDef`s exposed on 'http',
 * serves `/api/config/schema`, streams notification-bus events on `/events`,
 * and passes plugin `httpRoutes` through as-is. No business logic lives here.
 */
export class Router {
  private sseClients = new Set<ServerResponse>()
  private mcpTransports = new Map<string, SSEServerTransport>()
  private unsubscribe: () => void

  constructor(
    private registry: CommandRegistry,
    private ctx: TavernaContext,
    private pluginRoutes: HttpRoute[] = [],
  ) {
    this.unsubscribe = ctx.notificationBus.subscribe('*', (event) => this.broadcast(event))
  }

  close(): void {
    this.unsubscribe()
    for (const client of this.sseClients) client.end()
  }

  private json(res: ServerResponse, data: unknown, status = 200): void {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    })
    res.end(JSON.stringify(data))
  }

  private readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      let buf = ''
      req.on('data', (chunk: Buffer) => {
        buf += chunk.toString()
      })
      req.on('end', () => {
        try {
          resolve((buf ? JSON.parse(buf) : {}) as Record<string, unknown>)
        } catch {
          resolve({})
        }
      })
    })
  }

  private handleSchema(res: ServerResponse): void {
    const commands = this.registry.listFor('http').map((cmd) => ({
      id: cmd.id,
      namespace: cmd.namespace,
      path: commandPath(cmd),
      method: httpMethodFor(cmd.id),
      description: cmd.description,
      params: cmd.params ?? null,
    }))
    this.json(res, { commands })
  }

  private async callCommand(
    req: IncomingMessage,
    res: ServerResponse,
    cmd: RegisteredCommand,
    method: string,
    url: URL,
  ): Promise<void> {
    const params: Record<string, unknown> = {}
    if (method === 'POST') {
      Object.assign(params, await this.readBody(req))
    } else {
      url.searchParams.forEach((value, key) => {
        params[key] = value
      })
    }

    const result = await this.registry.execute(cmd.namespace, cmd.id, params, this.ctx)
    if (result.error !== undefined) {
      return this.json(res, { error: result.error, code: 'COMMAND_ERROR' }, 400)
    }
    return this.json(res, { data: result.data })
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname
    const method = req.method ?? 'GET'

    if (path === '/events') return this.handleSSE(req, res)
    if (path === '/api/config/schema' && method === 'GET') return this.handleSchema(res)

    if (path === '/mcp/sse' && method === 'GET') return this.handleMcpSSE(res)
    if (path === '/mcp/message' && method === 'POST') return this.handleMcpMessage(req, res, url)

    const apiMatch = path.match(/^\/api\/([^/]+)(?:\/([^/]+))?$/)
    if (apiMatch) {
      const [first, second] = [apiMatch[1], apiMatch[2]]
      const namespace = second !== undefined ? first : undefined
      const id = second ?? first
      if (id !== undefined) {
        const cmd = this.registry.find(namespace, id)
        if (cmd && (cmd.expose === undefined || cmd.expose.includes('http'))) {
          if (httpMethodFor(cmd.id) === method) return this.callCommand(req, res, cmd, method, url)
        }
      }
    }

    const pluginRoute = this.pluginRoutes.find((r) => {
      if (r.method !== method) return false
      return r.path.endsWith('*') ? path.startsWith(r.path.slice(0, -1)) : path === r.path
    })
    if (pluginRoute) return pluginRoute.handler(req, res, path)

    this.json(res, { error: `Not found: ${method} ${path}`, code: 'NOT_FOUND' }, 404)
  }

  private handleSSE(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    })
    res.write(`event: connected\ndata: ${new Date().toISOString()}\n\n`)
    this.sseClients.add(res)
    req.on('close', () => this.sseClients.delete(res))
  }

  /** MCP over HTTP — same tools as `taverna mcp` (stdio), exposed via SSE for clients that prefer not to spawn a process. */
  private async handleMcpSSE(res: ServerResponse): Promise<void> {
    const transport = new SSEServerTransport('/mcp/message', res)
    this.mcpTransports.set(transport.sessionId, transport)
    transport.onclose = () => this.mcpTransports.delete(transport.sessionId)

    const server = createMcpServer(this.ctx)
    await server.connect(transport)
  }

  private async handleMcpMessage(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const sessionId = url.searchParams.get('sessionId') ?? ''
    const transport = this.mcpTransports.get(sessionId)
    if (!transport) {
      return this.json(res, { error: `Unknown MCP session: ${sessionId}`, code: 'NOT_FOUND' }, 404)
    }
    await transport.handlePostMessage(req, res)
  }

  private broadcast(event: TavernaEvent): void {
    const msg = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
    for (const client of this.sseClients) {
      try {
        client.write(msg)
      } catch {
        this.sseClients.delete(client)
      }
    }
  }
}
