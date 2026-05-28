import { readdir, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { VaultCache } from './cache.js'
import type { TavernaConfig } from '../config.js'
import type { FeatureDef, FeatureContext } from '../infra/feature-map.js'
import { parseFrontmatter, getString } from '../vault/frontmatter.js'
import { findBacklinks } from '../vault/backlinks.js'
import { watch } from 'node:fs'
import { getDailyCosts, loadVaultBudgetConfig, getBudgetStatus } from '../pm/budget.js'
import { computeHealth } from '../pm/loki.js'
import { getActiveRuns, activeDir } from '../pm/active.js'
import { renderDashboard } from './dashboard.js'
import { renderFlow } from './flow.js'

type SSEClient = ServerResponse

export class Router {
  private sseClients = new Set<SSEClient>()
  private featureCtx: FeatureContext

  constructor(
    private cache: VaultCache,
    private config: TavernaConfig,
    private pluginFeatures: FeatureDef[] = [],
  ) {
    this.featureCtx = { vaultPath: config.vaultPath, config, scan: () => cache.get() }
    cache.onRefresh = () => this.broadcast('update')

    // Watch /tmp/taverna-active/ and broadcast agent_active events when runs start/stop
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

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://localhost`)
    const path = url.pathname
    const method = req.method ?? 'GET'

    if (path === '/dashboard') return this.handleDashboard(req, res)
    if (path === '/flow') return this.handleFlow(req, res)
    if (path === '/slides' || path.startsWith('/slides/')) return this.handleSlides(req, res, path)
    if (path === '/api/active') return this.handleApiActive(req, res)
    if (path === '/api/state') return this.handleApiState(req, res)
    if (path === '/api/costs') return this.handleApiCosts(req, res)
    if (path === '/api/budget') return this.handleApiBudget(req, res)
    if (method === 'POST' && path === '/api/run') return this.handleRun(req, res, [])
    if (method === 'POST' && path === '/api/drain') return this.handleRun(req, res, ['--drain'])
    if (method === 'POST' && path.startsWith('/api/run/')) {
      return this.handleRun(req, res, ['--project', decodeURIComponent(path.slice(9))])
    }
    if (method === 'GET' && path === '/api/session/preview')
      return this.handleSessionPreview(req, res, url)
    if (method === 'POST' && path === '/api/session/run') return this.handleSessionRun(req, res)
    if (path === '/status') return this.handleStatus(req, res)
    if (path === '/projects') return this.handleProjects(req, res)
    if (path.startsWith('/projects/')) return this.handleProject(req, res, path.slice(10))
    if (path === '/agents') return this.handleAgents(req, res)
    if (path === '/events') return this.handleSSE(req, res)
    if (path === '/inbox') return this.handleInbox(req, res)
    if (path === '/backlinks') return this.handleBacklinks(req, res, url)

    // Plugin routes — dispatched generically from loaded plugin features
    const pluginFeature = this.pluginFeatures.find(
      (f) => f.httpMethod === method && f.httpPath === path,
    )
    if (pluginFeature) return this.handlePluginFeature(req, res, pluginFeature)

    this.json(res, { error: 'not found' }, 404)
  }

  private async handlePluginFeature(
    req: IncomingMessage,
    res: ServerResponse,
    feature: FeatureDef,
  ): Promise<void> {
    const params =
      feature.httpMethod === 'POST' ? ((await this.readBody(req)) as Record<string, unknown>) : {}
    try {
      const result = await feature.handler(params, this.featureCtx)
      this.json(res, result)
    } catch (e) {
      this.json(res, { error: e instanceof Error ? e.message : String(e) }, 500)
    }
  }

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

  private async handleProjects(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const state = await this.cache.get()
    this.json(res, state.projects)
  }

  private async handleProject(
    _req: IncomingMessage,
    res: ServerResponse,
    id: string,
  ): Promise<void> {
    const state = await this.cache.get()
    const project = state.projects.find((p) => p.id === id || p.name === id)
    if (!project) return this.json(res, { error: `project "${id}" not found` }, 404)
    this.json(res, project)
  }

  private async handleAgents(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const state = await this.cache.get()
    this.json(
      res,
      state.agents.map((a) => ({
        id: a.id,
        folderName: a.folderName,
        description: a.description,
        runner: a.runner,
      })),
    )
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

  private async handleBacklinks(
    _req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    const note = url.searchParams.get('note')
    if (!note) return this.json(res, { error: 'missing ?note= parameter' }, 400)
    const notePath = note.startsWith('/') ? note : join(this.config.vaultPath, note)
    const results = await findBacklinks(this.config.vaultPath, notePath)
    this.json(res, { note, count: results.length, backlinks: results })
  }

  private async handleDashboard(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const state = await this.cache.get()
    const costs = getDailyCosts(this.config.vaultPath)
    const html = renderDashboard(state.projects, costs)
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  }

  private handleApiActive(_req: IncomingMessage, res: ServerResponse): void {
    this.json(res, getActiveRuns())
  }

  private async handleFlow(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const state = await this.cache.get()
    const html = renderFlow(state.projects)
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  }

  private async handleSlides(
    _req: IncomingMessage,
    res: ServerResponse,
    path: string,
  ): Promise<void> {
    const slidesDir = join(dirname(fileURLToPath(import.meta.url)), 'slides')

    if (path === '/slides') {
      let files: string[]
      try {
        files = (await readdir(slidesDir)).filter((f) => f.endsWith('.html'))
      } catch {
        files = []
      }
      const items = files
        .map((f) => {
          const name = f.replace(/\.html$/, '')
          return `<li><a href="/slides/${name}">${name}</a></li>`
        })
        .join('\n')
      const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Slides</title>
<style>body{font-family:monospace;background:#0c0a09;color:#d6d3d1;padding:40px}
a{color:#f59e0b}ul{line-height:2}</style></head>
<body><h2>Slides</h2><ul>${items}</ul><p><a href="/dashboard">← dashboard</a></p></body></html>`
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }

    const name = path.slice('/slides/'.length).replace(/[^a-zA-Z0-9_-]/g, '')
    const filePath = join(slidesDir, `${name}.html`)
    try {
      const html = await readFile(filePath, 'utf-8')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
    } catch {
      this.json(res, { error: `slide "${name}" not found` }, 404)
    }
  }

  private async handleApiState(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const state = await this.cache.get()
    const costs = getDailyCosts(this.config.vaultPath)
    const projects = state.projects.map((p) => ({
      ...p,
      health: computeHealth(p),
      cost_today: costs[p.id] ?? 0,
    }))
    this.json(res, { scannedAt: state.scannedAt, projects, costs })
  }

  private handleApiCosts(_req: IncomingMessage, res: ServerResponse): void {
    const costs = getDailyCosts(this.config.vaultPath)
    const total = Object.values(costs).reduce((s, v) => s + v, 0)
    this.json(res, { date: new Date().toISOString().slice(0, 10), costs, total })
  }

  private handleApiBudget(_req: IncomingMessage, res: ServerResponse): void {
    const globalConfig = loadVaultBudgetConfig(this.config.vaultPath)
    const status = getBudgetStatus(this.config.vaultPath, globalConfig)
    this.json(res, status)
  }

  private handleRun(_req: IncomingMessage, res: ServerResponse, extraArgs: string[]): void {
    const subcommand = extraArgs.includes('--project') ? 'run' : 'execute'
    const cmd = ['taverna', subcommand, ...extraArgs]
      .map((a) => `'${a.replace(/'/g, "'\\''")}'`)
      .join(' ')
    const proc = spawn('sh', ['-c', `${cmd} 2>&1 | systemd-cat --identifier=taverna-executor`], {
      stdio: 'ignore',
      detached: true,
      env: { ...process.env },
    })
    proc.unref()
    const drain = extraArgs.includes('--drain')
    const project = extraArgs.includes('--project')
      ? extraArgs[extraArgs.indexOf('--project') + 1]
      : undefined
    const label = project ? `projeto ${project}` : drain ? 'drain' : 'execute'
    this.json(res, { started: true, message: `taverna ${label} iniciado` })
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

  private async handleSessionPreview(
    _req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    const { isBlocked } = await import('../vault/task.js')
    const state = await this.cache.get()
    const filterProject = url.searchParams.get('project')
    const projects = filterProject
      ? state.projects.filter((p) => p.id === filterProject || p.name === filterProject)
      : state.projects

    const result = projects
      .map((p) => ({
        project: p.id,
        agent: p.agent ?? '',
        tasks: p.tasks
          .filter((t) => t.progresso < 100)
          .filter((t) => !isBlocked(t, p.tasks).blocked)
          .map((t) => ({
            id: t.id,
            title: t.title,
            progresso: t.progresso,
            prioridade: t.prioridade,
          })),
      }))
      .filter((p) => p.tasks.length > 0)

    this.json(res, {
      projects: result,
      total: result.reduce((s, p) => s + p.tasks.length, 0),
    })
  }

  private async handleSessionRun(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = (await this.readBody(req)) as { project?: string; tasks?: string }
    const project = body.project
    if (!project) return this.json(res, { error: 'project required' }, 400)

    const args = ['session', 'run', '--project', project]
    if (body.tasks) args.push('--tasks', body.tasks)

    const cmd = ['taverna', ...args].map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ')
    const proc = spawn('sh', ['-c', `${cmd} 2>&1 | systemd-cat --identifier=taverna-executor`], {
      stdio: 'ignore',
      detached: true,
      env: { ...process.env },
    })
    proc.unref()
    this.json(res, {
      started: true,
      message: `taverna session run iniciado para projeto ${project}`,
    })
  }

  private async handleInbox(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const inboxDir = join(this.config.vaultPath, '00_Inbox')
    if (!existsSync(inboxDir)) return this.json(res, { count: 0, items: [] })

    const files = (await readdir(inboxDir)).filter((f) => f.endsWith('.md'))
    const items = []

    for (const file of files) {
      const raw = await readFile(join(inboxDir, file), 'utf8').catch(() => '')
      if (!raw) continue
      const { data } = parseFrontmatter(raw)
      if (data['tipo'] !== 'agent-action-required') continue
      items.push({
        arquivo: file,
        projeto: getString(data, 'projeto'),
        agente: getString(data, 'agente'),
        urgencia: getString(data, 'urgencia'),
        timestamp: getString(data, 'timestamp'),
      })
    }

    items.sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''))
    this.json(res, { count: items.length, items })
  }
}
