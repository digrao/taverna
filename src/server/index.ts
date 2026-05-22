import { createServer as httpCreateServer } from 'node:http'
import type { Server } from 'node:http'
import type { TavernaConfig } from '../config.js'
import { VaultCache } from './cache.js'
import { Router } from './routes.js'

export interface ServeOptions {
  port?: number
}

export function createServer(config: TavernaConfig, opts: ServeOptions = {}): Server {
  const port = opts.port ?? 2948
  const cache = new VaultCache(config)
  const router = new Router(cache, config)

  const server = httpCreateServer((req, res) => {
    router.handle(req, res).catch(err => {
      console.error('server error:', err)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'internal server error' }))
      }
    })
  })

  server.listen(port, () => {
    console.log(`taverna serve  http://localhost:${port}`)
    console.log(`  GET  /dashboard | /api/state | /api/costs | /events`)
    console.log(`  POST /api/run   | /api/drain | /api/run/:id`)
    console.log(`  GET  /status | /projects | /projects/:id | /agents | /inbox`)
  })

  return server
}
