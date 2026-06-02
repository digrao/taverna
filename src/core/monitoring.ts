import { z } from 'zod'
import { scanVault } from '../vault/index.js'
import {
  computeHealth,
  getDailyCosts,
  loadVaultBudgetConfig,
  getBudgetStatus,
  getActiveRuns,
} from '../manager/observability/index.js'
import { readLogbook } from '../vault/logbook.js'
import type { TavernaContext, CommandDef } from './types.js'

function scanFor(ctx: TavernaContext) {
  return ctx.scan ? ctx.scan() : scanVault(ctx.config)
}

export async function getState(_params: Record<string, unknown>, ctx: TavernaContext) {
  const state = await scanFor(ctx)
  const costs = getDailyCosts(ctx.vaultPath)
  return {
    scannedAt: state.scannedAt,
    projects: state.projects.map((p) => ({
      ...p,
      health: computeHealth(p),
      cost_today: costs[p.id] ?? 0,
    })),
    costs,
  }
}

export async function getCosts(_params: Record<string, unknown>, ctx: TavernaContext) {
  const costs = getDailyCosts(ctx.vaultPath)
  const total = Object.values(costs).reduce((s, v) => s + v, 0)
  return { date: new Date().toISOString().slice(0, 10), costs, total }
}

export async function getBudget(_params: Record<string, unknown>, ctx: TavernaContext) {
  const globalConfig = loadVaultBudgetConfig(ctx.vaultPath)
  return getBudgetStatus(ctx.vaultPath, globalConfig)
}

export async function getActive() {
  return getActiveRuns()
}

export async function getRecentRuns(params: Record<string, unknown>, ctx: TavernaContext) {
  const hours = typeof params['hours'] === 'number' ? params['hours'] : 24
  const cutoff = new Date(Date.now() - hours * 3_600_000)
  const state = await scanVault(ctx.config)

  const runs: {
    agent: string
    project: string
    success: boolean | undefined
    duration: number | undefined
    ts: string
  }[] = []

  for (const agent of state.agents) {
    const entries = await readLogbook(agent.id, ctx.config)
    for (const e of entries) {
      if (new Date(e.timestamp) >= cutoff) {
        runs.push({
          agent: agent.id,
          project: e.projectName,
          success: e.success,
          duration: e.duration,
          ts: e.timestamp,
        })
      }
    }
  }

  runs.sort((a, b) => a.ts.localeCompare(b.ts))
  return {
    hours,
    total: runs.length,
    successes: runs.filter((r) => r.success === true).length,
    failures: runs.filter((r) => r.success === false).length,
    runs,
  }
}

export const monitoringCommands: CommandDef[] = [
  {
    id: 'state',
    description: 'All projects with health status, daily costs, and task progress',
    params: {},
    http: { method: 'GET', path: '/api/state' },
    handler: getState,
  },
  {
    id: 'active',
    description: 'Currently running agent sessions',
    params: {},
    http: { method: 'GET', path: '/api/active' },
    handler: async () => getActive(),
  },
  {
    id: 'costs',
    description: "Today's cost breakdown by project + total",
    params: {},
    http: { method: 'GET', path: '/api/costs' },
    handler: getCosts,
  },
  {
    id: 'budget',
    description: 'Token and USD budget usage today — global total and per-project breakdown',
    params: {},
    http: { method: 'GET', path: '/api/budget' },
    handler: getBudget,
  },
  {
    id: 'runs',
    description: 'Recent agent run history — success rate, duration, per project and agent',
    params: {
      hours: z.number().int().optional().describe('Lookback window in hours (default: 24)'),
    },
    http: { method: 'GET', path: '/api/runs' },
    handler: getRecentRuns,
  },
]
