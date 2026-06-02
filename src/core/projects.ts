import { z } from 'zod'
import { scanVault } from '../vault/index.js'
import { isBlocked } from '../vault/task.js'
import type { TavernaContext, CommandDef } from './types.js'

function scanFor(ctx: TavernaContext) {
  return ctx.scan ? ctx.scan() : scanVault(ctx.config)
}

export async function getProjects(_params: Record<string, unknown>, ctx: TavernaContext) {
  const state = await scanFor(ctx)
  return state.projects
}

export async function getProject(params: Record<string, unknown>, ctx: TavernaContext) {
  const state = await scanFor(ctx)
  const id = String(params['id'])
  const project = state.projects.find((p) => p.id === id || p.name === id)
  if (!project) throw new Error(`project "${id}" not found`)
  return project
}

export async function getAgents(_params: Record<string, unknown>, ctx: TavernaContext) {
  const state = await scanFor(ctx)
  return state.agents.map((a) => ({
    id: a.id,
    folderName: a.folderName,
    description: a.description,
    runner: a.runner,
  }))
}

export async function previewSessions(params: Record<string, unknown>, ctx: TavernaContext) {
  const state = await scanFor(ctx)
  const filter = params['project'] ? String(params['project']) : undefined
  const projects = filter
    ? state.projects.filter((p) => p.id === filter || p.name === filter)
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
}

export const projectsCommands: CommandDef[] = [
  {
    id: 'projects',
    description: 'List all vault projects with their frontmatter',
    params: {},
    http: { method: 'GET', path: '/projects' },
    handler: getProjects,
  },
  {
    id: 'project',
    description: 'Get a specific project by ID, including tasks and health',
    params: { id: z.string().describe('Project ID (e.g. PSI3451, taverna)') },
    http: { method: 'GET', path: '/projects/:id' },
    handler: getProject,
  },
  {
    id: 'agents',
    description: 'List all available agents with their directive metadata',
    params: {},
    http: { method: 'GET', path: '/agents' },
    handler: getAgents,
  },
  {
    id: 'session_preview',
    description: 'Show eligible unblocked tasks grouped by project for batched session execution',
    params: { project: z.string().optional().describe('Filter to a specific project ID') },
    http: { method: 'GET', path: '/api/session/preview' },
    handler: previewSessions,
  },
]
