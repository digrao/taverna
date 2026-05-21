import { readdir, readFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { existsSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { VaultCache } from './cache.js'
import type { TavernaConfig } from '../config.js'
import { parseFrontmatter, getString } from '../vault/frontmatter.js'

type SSEClient = ServerResponse

export class Router {
  private sseClients = new Set<SSEClient>()

  constructor(
    private cache: VaultCache,
    private config: TavernaConfig,
  ) {
    cache.onRefresh = () => this.broadcast('update')
  }

  private json(res: ServerResponse, data: unknown, status = 200): void {
    const body = JSON.stringify(data)
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    res.end(body)
  }

  private broadcast(event: string): void {
    const msg = `event: ${event}\ndata: ${new Date().toISOString()}\n\n`
    for (const client of this.sseClients) {
      try { client.write(msg) } catch { this.sseClients.delete(client) }
    }
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://localhost`)
    const path = url.pathname

    if (path === '/status') return this.handleStatus(req, res)
    if (path === '/projects') return this.handleProjects(req, res)
    if (path.startsWith('/projects/')) return this.handleProject(req, res, path.slice(10))
    if (path === '/agents') return this.handleAgents(req, res)
    if (path === '/events') return this.handleSSE(req, res)
    if (path === '/inbox') return this.handleInbox(req, res)
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

  private async handleProject(_req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
    const state = await this.cache.get()
    const project = state.projects.find(p => p.id === id || p.name === id)
    if (!project) return this.json(res, { error: `project "${id}" not found` }, 404)
    this.json(res, project)
  }

  private async handleAgents(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const state = await this.cache.get()
    this.json(res, state.agents.map(a => ({
      id: a.id,
      folderName: a.folderName,
      description: a.description,
      runner: a.runner,
    })))
  }

  private handleSSE(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    })
    res.write(`event: connected\ndata: ${new Date().toISOString()}\n\n`)
    this.sseClients.add(res)
    req.on('close', () => this.sseClients.delete(res))
  }

  private async handleInbox(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const inboxDir = join(this.config.vaultPath, '00_Inbox')
    if (!existsSync(inboxDir)) return this.json(res, { count: 0, items: [] })

    const files = (await readdir(inboxDir)).filter(f => f.endsWith('.md'))
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
