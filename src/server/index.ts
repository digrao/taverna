import { createServer as httpCreateServer } from 'node:http'
import type { Server } from 'node:http'
import type { TavernaConfig } from '../config.js'
import { VaultCache } from './cache.js'
import { Router } from './routes.js'
import { loadPlugins, collectPluginFeatures, collectPluginRoutes } from '../plugin/loader.js'

export interface ServeOptions {
  port?: number
}

export async function createServer(
  config: TavernaConfig,
  opts: ServeOptions = {},
): Promise<Server> {
  const port = opts.port ?? 2948
  const cache = new VaultCache(config)
  const plugins = await loadPlugins()
  const pluginFeatures = collectPluginFeatures(plugins)
  const pluginRoutes = collectPluginRoutes(plugins)
  const router = new Router(cache, config, pluginFeatures, pluginRoutes)

  const server = httpCreateServer((req, res) => {
    router.handle(req, res).catch((err) => {
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
