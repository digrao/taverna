import { z } from 'zod'
import type { CommandDef, TavernaContext } from './types.js'
import { scanVault } from '../vault/index.js'

function scanFor(ctx: TavernaContext) {
  return ctx.scan ? ctx.scan() : scanVault(ctx.config)
}

export const projectsCommands: CommandDef[] = [
  {
    id: 'projects',
    description: 'List all vault projects with their frontmatter',
    params: {},
    http: { method: 'GET', path: '/projects' },
    handler: async (_, ctx) => {
      const state = await scanFor(ctx)
      return state.projects
    },
  },

  {
    id: 'project',
    description: 'Get a specific project by ID, including tasks and health',
    params: { id: z.string().describe('Project ID (e.g. PSI3451, taverna)') },
    http: { method: 'GET', path: '/projects/:id' },
    handler: async ({ id }, ctx) => {
      const state = await scanFor(ctx)
      const project = state.projects.find((p) => p.id === id || p.name === id)
      if (!project) throw new Error(`project "${String(id)}" not found`)
      return project
    },
  },

  {
    id: 'agents',
    description: 'List all available agents with their directive metadata',
    params: {},
    http: { method: 'GET', path: '/agents' },
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
]
