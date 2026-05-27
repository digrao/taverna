import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { VaultCache } from './cache.js'
import type { TavernaConfig } from '../config.js'
import { parseFrontmatter, getString } from '../vault/frontmatter.js'
import { findBacklinks } from '../vault/backlinks.js'
import { watch } from 'node:fs'
import { getDailyCosts, loadVaultBudgetConfig, getBudgetStatus } from '../pm/budget.js'
import { computeHealth } from '../pm/loki.js'
import { getActiveRuns, activeDir } from '../pm/active.js'
import { renderDashboard } from './dashboard.js'
import { renderFlow } from './flow.js'
import { renderSlides } from './slides.js'
import { renderInfra } from './infra.js'
import { renderIshine } from './ishine.js'

type SSEClient = ServerResponse

export class Router {
  private sseClients = new Set<SSEClient>()

  constructor(
    private cache: VaultCache,
    private config: TavernaConfig,
  ) {
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
    if (path === '/slides') return this.handleSlides(req, res)
    if (path === '/ishine') return this.handleIshine(req, res)
    if (path === '/infraestrutura') return this.handleInfra(req, res)
    if (path === '/api/active') return this.handleApiActive(req, res)
    if (path === '/api/state') return this.handleApiState(req, res)
    if (path === '/api/costs') return this.handleApiCosts(req, res)
    if (path === '/api/budget') return this.handleApiBudget(req, res)
    if (method === 'POST' && path === '/api/run') return this.handleRun(req, res, [])
    if (method === 'POST' && path === '/api/drain') return this.handleRun(req, res, ['--drain'])
    if (method === 'POST' && path.startsWith('/api/run/')) {
      return this.handleRun(req, res, ['--project', decodeURIComponent(path.slice(9))])
    }
    if (path === '/status') return this.handleStatus(req, res)
    if (path === '/projects') return this.handleProjects(req, res)
    if (path.startsWith('/projects/')) return this.handleProject(req, res, path.slice(10))
    if (path === '/agents') return this.handleAgents(req, res)
    if (path === '/events') return this.handleSSE(req, res)
    if (path === '/inbox') return this.handleInbox(req, res)
    if (path === '/backlinks') return this.handleBacklinks(req, res, url)
    this.json(res, { error: 'not found' }, 404)
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

  private handleSlides(_req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(renderSlides())
  }

  private handleIshine(_req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(renderIshine())
  }

  private handleInfra(_req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(renderInfra())
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
