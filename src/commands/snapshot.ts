import { z } from 'zod'
import type { CommandDef } from './types.js'
import { scanVault } from '../vault/index.js'
import { computeHealth, snapshot } from '../pm/observability/index.js'

export const snapshotCommands: CommandDef[] = [
  {
    id: 'health',
    description: 'Emit health snapshot events for all projects (health + priority)',
    params: {
      tipo: z.string().optional().describe('Filter by project type: USP, BB, *'),
    },
    handler: async ({ tipo }, ctx) => {
      const vault = await scanVault(ctx.config)
      const projects = tipo ? vault.projects.filter((p) => p.tipo === String(tipo)) : vault.projects

      const results = projects.map((p) => {
        const payload = computeHealth(p)
        if (!ctx.dryRun) snapshot(p)
        return { id: p.id, health: payload.health, progresso: payload.progresso }
      })

      return { count: results.length, projects: results }
    },
  },
]
