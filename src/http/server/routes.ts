import { readFileSync, existsSync, statSync, watch } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { VaultCache } from './cache.js'
import type { TavernaConfig } from '../../config.js'
import type { CommandDef, TavernaContext } from '../../core/types.js'
import { features } from '../feature-map.js'
import { notificationBus } from '../../notifications/bus.js'
import type { HttpRoute } from '../../plugin/types.js'
import { getActiveRuns, activeDir } from '../../manager/observability/index.js'

// ── Path matching ─────────────────────────────────────────────────────────────
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

type SSEClient = ServerResponse
type SendFn = (type: string, data: unknown) => boolean

export class Router {
  private sseClients = new Set<SSEClient>()
  private ctx: TavernaContext

  constructor(
    private cache: VaultCache,
    private config: TavernaConfig,
    private pluginCommands: CommandDef[] = [],
    private pluginRoutes: HttpRoute[] = [],
  ) {
    this.ctx = {
      vaultPath: config.vaultPath,
      config,
      notificationBus,
      scan: () => cache.get(),
    }

    cache.onRefresh = () => this.broadcast('update')

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

  private async callCommand(
    req: IncomingMessage,
    res: ServerResponse,
    cmd: CommandDef & { http: NonNullable<CommandDef['http']> },
    pathParams: Record<string, string>,
    url: URL,
  ): Promise<void> {
    const params: Record<string, unknown> = { ...pathParams }
    if (cmd.http.method === 'POST') {
      const body = (await this.readBody(req)) as Record<string, unknown>
      Object.assign(params, body)
    } else {
      url.searchParams.forEach((v, k) => {
        params[k] = v
      })
    }
    try {
      const result = await cmd.handler(params, this.ctx)
      this.json(res, result)
    } catch (e) {
      this.json(res, { error: e instanceof Error ? e.message : String(e) }, 500)
    }
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname
    const method = req.method ?? 'GET'

    // ── Global SSE ─────────────────────────────────────────────────────────
    if (path === '/events') return this.handleSSE(req, res)

    // ── Per-project run view (SSE + HTML) ──────────────────────────────────
    const runMatch = path.match(/^\/run\/([^/]+)(\/events)?$/)
    if (method === 'GET' && runMatch) {
      const projectId = decodeURIComponent(runMatch[1] ?? '')
      if (runMatch[2]) return this.handleRunEvents(req, res, projectId)
      return this.handleRunView(req, res, projectId)
    }

    // ── Auto-registered commands (core + plugins) ──────────────────────────
    const allRoutes = [
      ...features,
      ...this.pluginCommands.filter(
        (c): c is CommandDef & { http: NonNullable<CommandDef['http']> } => c.http !== undefined,
      ),
    ]

    for (const cmd of allRoutes) {
      if (cmd.http.method !== method) continue
      const pathParams = matchPath(cmd.http.path, path)
      if (pathParams !== null) return this.callCommand(req, res, cmd, pathParams, url)
    }

    // ── Plugin raw HTTP routes (HTML, assets, etc.) ────────────────────────
    const pluginRoute = this.pluginRoutes.find((r) => {
      if (r.method !== method) return false
      return r.path.endsWith('*') ? path.startsWith(r.path.slice(0, -1)) : path === r.path
    })
    if (pluginRoute) return pluginRoute.handler(req, res, path)

    this.json(res, { error: 'not found' }, 404)
  }

  // ── Run view (HTML) ───────────────────────────────────────────────────────

  private handleRunView(_req: IncomingMessage, res: ServerResponse, projectId: string): void {
    const html = `<!doctype html><html><head><title>Run — ${projectId}</title></head>
<body><pre id="log"></pre><script>
const es = new EventSource('/run/${encodeURIComponent(projectId)}/events');
const log = document.getElementById('log');
es.addEventListener('agent_log', e => { log.textContent += JSON.parse(e.data).message });
es.addEventListener('agent_done', () => { log.textContent += '\\n[done]' });
</script></body></html>`
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
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

    const runs = getActiveRuns()
    const current = runs.find((r) => r.project === projectId)
    if (current) {
      send('agent_active', current)
      if (current.logFile) this.tailLog(current.logFile, projectId, send, cleanup)
    } else {
      send('idle', { project: projectId })
    }

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
