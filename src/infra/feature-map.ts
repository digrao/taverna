import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { z } from 'zod'
import type { TavernaConfig } from '../config.js'
import type { VaultState } from '../vault/types.js'
import { scanVault } from '../vault/index.js'
import { computeHealth } from '../pm/loki.js'
import { getDailyCosts, loadVaultBudgetConfig, getBudgetStatus } from '../pm/budget.js'
import { getActiveRuns } from '../pm/active.js'
import { findBacklinks } from '../vault/backlinks.js'
import { isBlocked } from '../vault/task.js'
import { parseFrontmatter, getString } from '../vault/frontmatter.js'

export interface FeatureContext {
  vaultPath: string
  config: TavernaConfig
  // Optional cached scanner — HTTP server passes cache.get, MCP calls scanVault directly
  scan?: () => Promise<VaultState>
}

export type ZodRawShape = Record<string, z.ZodTypeAny>

export interface FeatureDef {
  name: string
  description: string
  params: ZodRawShape
  httpMethod: 'GET' | 'POST'
  httpPath?: string // default: /api/<name>; use :param notation for dynamic segments
  handler: (params: Record<string, unknown>, ctx: FeatureContext) => Promise<unknown>
}

function scanFor(ctx: FeatureContext): Promise<VaultState> {
  return ctx.scan ? ctx.scan() : scanVault(ctx.config)
}

function spawnTaverna(args: string[]): void {
  const proc = spawn('taverna', args, {
    stdio: 'ignore',
    detached: true,
    env: { ...process.env },
  })
  proc.unref()
}

export const features: FeatureDef[] = [
  {
    name: 'state',
    description: 'All projects with health status, daily costs, and task progress',
    params: {},
    httpMethod: 'GET',
    httpPath: '/api/state',
    handler: async (_, ctx) => {
      const state = await scanFor(ctx)
      const costs = getDailyCosts(ctx.vaultPath)
      const projects = state.projects.map((p) => ({
        ...p,
        health: computeHealth(p),
        cost_today: costs[p.id] ?? 0,
      }))
      return { scannedAt: state.scannedAt, projects, costs }
    },
  },

  {
    name: 'active',
    description: 'Currently running agent sessions',
    params: {},
    httpMethod: 'GET',
    httpPath: '/api/active',
    handler: async () => getActiveRuns(),
  },

  {
    name: 'costs',
    description: "Today's cost breakdown by project + total",
    params: {},
    httpMethod: 'GET',
    httpPath: '/api/costs',
    handler: async (_, ctx) => {
      const costs = getDailyCosts(ctx.vaultPath)
      const total = Object.values(costs).reduce((s, v) => s + v, 0)
      return { date: new Date().toISOString().slice(0, 10), costs, total }
    },
  },

  {
    name: 'budget',
    description: 'Token and USD budget usage today — global total and per-project breakdown',
    params: {},
    httpMethod: 'GET',
    httpPath: '/api/budget',
    handler: async (_, ctx) => {
      const globalConfig = loadVaultBudgetConfig(ctx.vaultPath)
      return getBudgetStatus(ctx.vaultPath, globalConfig)
    },
  },

  {
    name: 'projects',
    description: 'List all vault projects with their frontmatter',
    params: {},
    httpMethod: 'GET',
    httpPath: '/projects',
    handler: async (_, ctx) => {
      const state = await scanFor(ctx)
      return state.projects
    },
  },

  {
    name: 'project',
    description: 'Get a specific project by ID, including tasks and health',
    params: { id: z.string().describe('Project ID (e.g. PSI3451, taverna)') },
    httpMethod: 'GET',
    httpPath: '/projects/:id',
    handler: async ({ id }, ctx) => {
      const state = await scanFor(ctx)
      const project = state.projects.find((p) => p.id === id || p.name === id)
      if (!project) throw new Error(`project "${String(id)}" not found`)
      return project
    },
  },

  {
    name: 'agents',
    description: 'List all available agents with their directive metadata',
    params: {},
    httpMethod: 'GET',
    httpPath: '/agents',
    handler: async (_, ctx) => {
      const state = await scanFor(ctx)
      return state.agents.map((a) => ({
        id: a.id,
        folderName: a.folderName,
        description: a.description,
        runner: a.runner,
      }))
    },
  },

  {
    name: 'inbox',
    description: 'Pending agent-action-required items awaiting human input',
    params: {},
    httpMethod: 'GET',
    httpPath: '/inbox',
    handler: async (_, ctx) => {
      const inboxDir = join(ctx.vaultPath, '00_Inbox')
      if (!existsSync(inboxDir)) return { count: 0, items: [] }
      const files = (await readdir(inboxDir)).filter((f) => f.endsWith('.md'))
      const items: Record<string, string | undefined>[] = []
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
      items.sort((a, b) => (b['timestamp'] ?? '').localeCompare(a['timestamp'] ?? ''))
      return { count: items.length, items }
    },
  },

  {
    name: 'backlinks',
    description: 'Find all vault files that link to a given note',
    params: { note: z.string().describe('Note name or path relative to vault root') },
    httpMethod: 'GET',
    httpPath: '/backlinks',
    handler: async ({ note }, ctx) => {
      const n = String(note)
      const notePath = n.startsWith('/') ? n : join(ctx.vaultPath, n)
      const results = await findBacklinks(ctx.vaultPath, notePath)
      return { note, count: results.length, backlinks: results }
    },
  },

  {
    name: 'session_preview',
    description: 'Show eligible unblocked tasks grouped by project for batched session execution',
    params: { project: z.string().optional().describe('Filter to a specific project ID') },
    httpMethod: 'GET',
    httpPath: '/api/session/preview',
    handler: async ({ project }, ctx) => {
      const state = await scanFor(ctx)
      const projects = project
        ? state.projects.filter((p) => p.id === project || p.name === project)
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
      return { projects: result, total: result.reduce((s, p) => s + p.tasks.length, 0) }
    },
  },

  {
    name: 'run',
    description: 'Trigger taverna execute — runs agents on all eligible projects',
    params: {},
    httpMethod: 'POST',
    httpPath: '/api/run',
    handler: async () => {
      spawnTaverna(['execute'])
      return { started: true, message: 'taverna execute iniciado' }
    },
  },

  {
    name: 'drain',
    description: 'Trigger taverna execute --drain — drains task queues in all eligible projects',
    params: {},
    httpMethod: 'POST',
    httpPath: '/api/drain',
    handler: async () => {
      spawnTaverna(['execute', '--drain'])
      return { started: true, message: 'taverna execute --drain iniciado' }
    },
  },

  {
    name: 'run_project',
    description: 'Run an agent on a specific project immediately',
    params: { id: z.string().describe('Project ID') },
    httpMethod: 'POST',
    httpPath: '/api/run/:id',
    handler: async ({ id }) => {
      spawnTaverna(['run', '--project', String(id)])
      return { started: true, message: `taverna run --project ${String(id)} iniciado` }
    },
  },

  {
    name: 'session_run',
    description:
      'Launch a batched agent session — all eligible tasks run in one context window to maximise cache reuse',
    params: {
      project: z.string().describe('Project ID (e.g. taverna, PSI3451)'),
      tasks: z
        .string()
        .optional()
        .describe('Comma-separated task IDs to include (default: all unblocked pending)'),
    },
    httpMethod: 'POST',
    httpPath: '/api/session/run',
    handler: async ({ project, tasks }) => {
      const args = ['session', 'run', '--project', String(project)]
      if (tasks) args.push('--tasks', String(tasks))
      spawnTaverna(args)
      return {
        started: true,
        message: `taverna session run iniciado para projeto ${String(project)}`,
      }
    },
  },
]

export const featureMap = new Map<string, FeatureDef>(features.map((f) => [f.name, f]))
