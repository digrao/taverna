import type { CommandDef, TavernaContext } from './types.js'
import { scanVault } from '../vault/index.js'
import { computeHealth } from '../pm/observability/index.js'
import { getDailyCosts, loadVaultBudgetConfig, getBudgetStatus } from '../pm/observability/index.js'
import { getActiveRuns } from '../pm/observability/index.js'

function scanFor(ctx: TavernaContext) {
  return ctx.scan ? ctx.scan() : scanVault(ctx.config)
}

export const stateCommands: CommandDef[] = [
  {
    id: 'state',
    description: 'All projects with health status, daily costs, and task progress',
    params: {},
    http: { method: 'GET', path: '/api/state' },
    handler: async (_, ctx) => {
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
    },
  },

  {
    id: 'active',
    description: 'Currently running agent sessions',
    params: {},
    http: { method: 'GET', path: '/api/active' },
    handler: async () => getActiveRuns(),
  },

  {
    id: 'costs',
    description: "Today's cost breakdown by project + total",
    params: {},
    http: { method: 'GET', path: '/api/costs' },
    handler: async (_, ctx) => {
      const costs = getDailyCosts(ctx.vaultPath)
      const total = Object.values(costs).reduce((s, v) => s + v, 0)
      return { date: new Date().toISOString().slice(0, 10), costs, total }
    },
  },

  {
    id: 'budget',
    description: 'Token and USD budget usage today — global total and per-project breakdown',
    params: {},
    http: { method: 'GET', path: '/api/budget' },
    handler: async (_, ctx) => {
      const globalConfig = loadVaultBudgetConfig(ctx.vaultPath)
      return getBudgetStatus(ctx.vaultPath, globalConfig)
    },
  },
]
