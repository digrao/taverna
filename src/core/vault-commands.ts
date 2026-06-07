import { join } from 'node:path'
import { scanVault, readInbox, findBacklinks } from '../vault/index.js'
import type { TavernaContext, CommandDef } from './types.js'

export async function getProjects(params: Record<string, unknown>, ctx: TavernaContext) {
  const projects = await scanVault(ctx.config)
  const status = params['status'] !== undefined ? String(params['status']) : undefined
  const tipo = params['tipo'] !== undefined ? String(params['tipo']) : undefined

  const filtered = projects
    .filter((p) => status === undefined || p.status === status)
    .filter((p) => tipo === undefined || p.tipo === tipo)

  return { projects: filtered }
}

export async function getProject(params: Record<string, unknown>, ctx: TavernaContext) {
  const id = String(params['id'])
  const projects = await scanVault(ctx.config)
  const project = projects.find((p) => p.id === id || p.name === id)
  if (!project) throw new Error(`Project not found: ${id}`)

  return { project, tasks: project.tasks }
}

export async function getInbox(_params: Record<string, unknown>, ctx: TavernaContext) {
  const items = await readInbox(ctx.config.vaultPath)
  return { items }
}

export async function getBacklinks(params: Record<string, unknown>, ctx: TavernaContext) {
  const file = String(params['file'])
  const filePath = join(ctx.config.vaultPath, file)
  const backlinks = await findBacklinks(ctx.config.vaultPath, filePath)
  return { backlinks }
}

export const vaultCommands: CommandDef[] = [
  {
    id: 'get_projects',
    description: 'Lists all vault projects with their frontmatter metadata',
    params: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        tipo: { type: 'string' },
      },
    },
    handler: getProjects,
  },
  {
    id: 'get_project',
    description: 'Returns a specific project with its tasks',
    params: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    handler: getProject,
  },
  {
    id: 'get_inbox',
    description: 'Returns the items in the vault inbox',
    handler: getInbox,
  },
  {
    id: 'get_backlinks',
    description: 'Returns the wikilink references to a given file',
    params: {
      type: 'object',
      properties: { file: { type: 'string' } },
      required: ['file'],
    },
    handler: getBacklinks,
  },
]
