import { readFileSync, existsSync, statSync, watch } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { VaultCache } from './cache.js'
import type { TavernaConfig } from '../config.js'
import type { FeatureDef, FeatureContext } from '../infra/feature-map.js'
import { features } from '../infra/feature-map.js'
import { notificationBus } from '../notifications/bus.js'
import type { HttpRoute } from '../plugin/types.js'
import { getDailyCosts } from '../pm/budget.js'
import { getActiveRuns, activeDir } from '../pm/active.js'
import { renderDashboard } from './dashboard.js'
import { renderFlow } from './flow.js'
import { renderRunPage } from './run-view.js'

type SSEClient = ServerResponse
type SendFn = (type: string, data: unknown) => boolean

// ── Path matching ────────────────────────────────────────────────────────────
// Supports :param segments: matchPath('/projects/:id', '/projects/foo') → { id: 'foo' }
function matchPath(pattern: string, actual: string): Record<string, string> | null {
  const pp = pattern.split('/')
  const ap = actual.split('/')
  if (pp.length !== ap.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < pp.length; i++) {
    const seg = pp.at(i)
    const act = ap.at(i)
    if (seg === undefined || act === undefined) return null
    if (seg.startsWith(':')) {
      params[seg.slice(1)] = decodeURIComponent(act)
    } else if (seg !== act) {
      return null
    }
  }
  return params
}

export class Router {
  private sseClients = new Set<SSEClient>()
  private featureCtx: FeatureContext

  constructor(
    private cache: VaultCache,
    private config: TavernaConfig,
    private pluginFeatures: FeatureDef[] = [],
    private pluginRoutes: HttpRoute[] = [],
  ) {
    this.featureCtx = {
      vaultPath: config.vaultPath,
      config,
      notificationBus,
      scan: () => cache.get(),
    }
    cache.onRefresh = () => this.broadcast('update')

    // Broadcast agent_active events when runs start/stop
    try {
      watch(activeDir(), () => {
        const runs = getActiveRuns()
        const msg = `event: agent_active\ndata: ${JSON.stringify(runs)}\n\n`
        for (const client of this.sseClients) {
          try {
            client.write(msg)
          } catch {
            this.sseClients.delete(client)
          }
        }
      })
    } catch {
      /* non-fatal if watch fails */
    }
  }

  private json(res: ServerResponse, data: unknown, status = 200): void {
    const body = JSON.stringify(data)
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    })
    res.end(body)
  }

  private broadcast(event: string): void {
    const msg = `event: ${event}\ndata: ${new Date().toISOString()}\n\n`
    for (const client of this.sseClients) {
      try {
        client.write(msg)
      } catch {
        this.sseClients.delete(client)
      }
    }
  }

  private readBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve) => {
      let buf = ''
      req.on('data', (chunk: Buffer) => {
        buf += chunk.toString()
      })
      req.on('end', () => {
        try {
          resolve(JSON.parse(buf))
        } catch {
          resolve({})
        }
      })
    })
  }

  // ── Unified feature caller ─────────────────────────────────────────────────
  // Merges path params + query string (GET) or body (POST) before calling handler.
  private async callFeature(
    req: IncomingMessage,
    res: ServerResponse,
    feature: FeatureDef,
    pathParams: Record<string, string>,
    url: URL,
  ): Promise<void> {
    const params: Record<string, unknown> = { ...pathParams }
    if (feature.httpMethod === 'POST') {
      const body = (await this.readBody(req)) as Record<string, unknown>
      Object.assign(params, body)
    } else {
      url.searchParams.forEach((v, k) => {
        params[k] = v
      })
    }
    try {
      const result = await feature.handler(params, this.featureCtx)
      this.json(res, result)
    } catch (e) {
      this.json(res, { error: e instanceof Error ? e.message : String(e) }, 500)
    }
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname
    const method = req.method ?? 'GET'

    // ── HTML pages & global SSE (HTTP-specific, not in feature-map) ──────────
    if (path === '/dashboard') return this.handleDashboard(req, res)
    if (path === '/flow') return this.handleFlow(req, res)
    if (path === '/status') return this.handleStatus(req, res)
    if (path === '/events') return this.handleSSE(req, res)

    // ── Live run view (HTTP-specific: HTML page + per-project SSE log tail) ───
    const runMatch = path.match(/^\/run\/([^/]+)(\/events)?$/)
    if (method === 'GET' && runMatch) {
      const projectId = decodeURIComponent(runMatch[1] ?? '')
      if (runMatch[2]) return this.handleRunEvents(req, res, projectId)
      return this.handleRunView(req, res, projectId)
    }

    // ── Feature-map lookup (core + plugin) ───────────────────────────────────
    const allFeatures = [...features, ...this.pluginFeatures]
    for (const feature of allFeatures) {
      if (feature.httpMethod !== method) continue
      const httpPath = feature.httpPath ?? `/api/${feature.name}`
      const pathParams = matchPath(httpPath, path)
      if (pathParams !== null) {
        return this.callFeature(req, res, feature, pathParams, url)
      }
    }

    // ── Plugin raw HTTP routes (HTML, assets, etc.) ───────────────────────────
    const pluginRoute = this.pluginRoutes.find((r) => {
      if (r.method !== method) return false
      return r.path.endsWith('*') ? path.startsWith(r.path.slice(0, -1)) : path === r.path
    })
    if (pluginRoute) return pluginRoute.handler(req, res, path)

    this.json(res, { error: 'not found' }, 404)
  }

  // ── HTML renderers ────────────────────────────────────────────────────────

  private async handleDashboard(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const state = await this.cache.get()
    const costs = getDailyCosts(this.config.vaultPath)
    const html = renderDashboard(state.projects, costs)
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  }

  private async handleFlow(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const state = await this.cache.get()
    const html = renderFlow(state.projects)
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  }

  private handleRunView(_req: IncomingMessage, res: ServerResponse, projectId: string): void {
    const html = renderRunPage(projectId)
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  }

  // ── Status (HTTP-server-specific: includes sseClients count) ─────────────

  private async handleStatus(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const state = await this.cache.get()
    this.json(res, {
      scannedAt: state.scannedAt,
      projects: state.projects.length,
      agents: state.agents.length,
      vaultPath: state.vaultPath,
      sseClients: this.sseClients.size,
    })
  }

  // ── Global SSE ────────────────────────────────────────────────────────────

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

  // ── Per-project SSE log tail ──────────────────────────────────────────────
  // Streams the executor log file in real-time; also watches the active dir
  // so the client knows when a run starts or ends.

  private handleRunEvents(req: IncomingMessage, res: ServerResponse, projectId: string): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    })

    const cleanup: (() => void)[] = []
    req.on('close', () => cleanup.forEach((fn) => fn()))

    const send: SendFn = (type, data) => {
      try {
        res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
        return true
      } catch {
        return false
      }
    }

    // Check current state
    const runs = getActiveRuns()
    const current = runs.find((r) => r.project === projectId)
    if (current) {
      send('agent_active', current)
      if (current.logFile) this.tailLog(current.logFile, projectId, send, cleanup)
    } else {
      send('idle', { project: projectId })
    }

    // Watch active dir: notify when run appears or disappears
    try {
      const w = watch(activeDir(), () => {
        const updated = getActiveRuns()
        const run = updated.find((r) => r.project === projectId)
        if (run) {
          send('agent_active', run)
          if (run.logFile) this.tailLog(run.logFile, projectId, send, cleanup)
        } else {
          send('agent_done', { project: projectId })
        }
      })
      cleanup.push(() => w.close())
    } catch {
      /* non-fatal */
    }
  }

  private tailLog(logFile: string, projectId: string, send: SendFn, cleanup: (() => void)[]): void {
    if (!existsSync(logFile)) return

    // Send existing content
    try {
      const content = readFileSync(logFile, 'utf8')
      if (content) send('agent_log', { project: projectId, message: content })
    } catch {
      /* ignore */
    }

    let offset = 0
    try {
      offset = statSync(logFile).size
    } catch {
      /* ignore */
    }

    // Watch for appended content
    try {
      const w = watch(logFile, () => {
        try {
          const buf = readFileSync(logFile)
          const newBytes = buf.subarray(offset)
          if (newBytes.length > 0) {
            offset = buf.length
            send('agent_log', { project: projectId, message: newBytes.toString('utf8') })
          }
        } catch {
          /* ignore */
        }
      })
      cleanup.push(() => w.close())
    } catch {
      /* non-fatal */
    }
  }
}
