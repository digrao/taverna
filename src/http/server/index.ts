import { createServer as httpCreateServer } from 'node:http'
import type { Server } from 'node:http'
import { coreCommands } from '../../core/index.js'
import type { TavernaContext } from '../../core/types.js'
import { loadPlugins } from '../../plugin/loader.js'
import { Router } from './routes.js'

export interface ServeOptions {
  port?: number
}

/** Starts the persistent HTTP server — exposes `/api/<id>`, `/api/<namespace>/<id>`, `/events` (SSE), and `/mcp/sse` + `/mcp/message`. */
export async function createServer(ctx: TavernaContext, opts: ServeOptions = {}): Promise<Server> {
  const port = opts.port ?? ctx.config.port

  const { httpRoutes } = await loadPlugins(ctx.config, ctx.notificationBus)
  const router = new Router(coreCommands, ctx, httpRoutes)

  const server = httpCreateServer((req, res) => {
    router.handle(req, res).catch((e) => {
      console.error('server error:', e)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'internal server error' }))
      }
    })
  })

  server.on('close', () => router.close())

  server.listen(port, () => {
    console.log(`taverna serve  http://localhost:${port}`)
    console.log(`  GET  /api/config/schema`)
    console.log(`  GET  /api/<id>            POST /api/<id>            (core commands)`)
    console.log(`  GET  /api/<namespace>/<id>  POST /api/<namespace>/<id>  (plugin commands)`)
    console.log(`  GET  /events              (SSE — notification bus)`)
    console.log(`  GET  /mcp/sse  POST /mcp/message  (MCP over HTTP)`)
  })

  return server
}
