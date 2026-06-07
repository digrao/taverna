import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import matter from 'gray-matter'
import { scanVault, scaffoldProject, writeTaskFile } from '../vault/index.js'
import type { TaskFileInput } from '../vault/index.js'
import type { RawFrontmatter, VaultProject } from '../vault/types.js'
import { countExistingItems, readFlow, resolveTemplate } from './flow/index.js'
import type { TavernaContext, CommandDef } from './types.js'

async function findProject(ctx: TavernaContext, projectId: string): Promise<VaultProject> {
  const projects = await scanVault(ctx.config)
  const project = projects.find((p) => p.id === projectId || p.name === projectId)
  if (!project) throw new Error(`Project not found: ${projectId}`)
  return project
}

/** When `add_task` omits `title`, render it from the task flow's entry-state `default.title` template. */
async function inferTitle(ctx: TavernaContext, project: VaultProject): Promise<string> {
  const flow = await readFlow(join(ctx.config.vaultPath, ctx.config.flowDir), 'task')
  const targets = new Set(flow.transitions.map((t) => t.to))
  const entry = flow.states.find((s) => !targets.has(s.id))
  const template = entry?.default['title']
  if (template === undefined) return 'untitled'

  const counter = await countExistingItems(join(project.folderPath, 'tasks'))
  return resolveTemplate(template, { now: new Date(), counter, frontmatter: {} })
}

export async function getTaskStatus(params: Record<string, unknown>, ctx: TavernaContext) {
  const project = await findProject(ctx, String(params['projectId']))
  const taskId = String(params['taskId'])
  const task = project.tasks.find((t) => t.id === taskId)
  if (!task) throw new Error(`Task not found: ${taskId} in ${project.id}`)

  return { task }
}

export async function archiveTask(params: Record<string, unknown>, ctx: TavernaContext) {
  const project = await findProject(ctx, String(params['projectId']))
  const taskId = String(params['taskId'])
  const task = project.tasks.find((t) => t.id === taskId)
  if (!task) throw new Error(`Task not found: ${taskId} in ${project.id}`)

  const archiveDir = join(project.folderPath, 'tasks', 'archive')
  await mkdir(archiveDir, { recursive: true })
  const archivedTo = join(archiveDir, basename(task.filePath))

  const raw = await readFile(task.filePath, 'utf8')
  const parsed = matter(raw)
  parsed.data['progresso'] = 100
  await writeFile(task.filePath, matter.stringify(parsed.content, parsed.data), 'utf8')
  await rename(task.filePath, archivedTo)

  ctx.notificationBus.publish({
    type: 'core.task.archived',
    payload: { projectId: project.id, taskId: task.id, archivedTo },
    timestamp: new Date().toISOString(),
  })

  return { archivedTo }
}

export async function addTask(params: Record<string, unknown>, ctx: TavernaContext) {
  const project = await findProject(ctx, String(params['projectId']))

  const title =
    params['title'] !== undefined ? String(params['title']) : await inferTitle(ctx, project)

  const frontmatter: RawFrontmatter = {}
  if (typeof params['progresso'] === 'number') frontmatter['progresso'] = params['progresso']
  if (Array.isArray(params['depende'])) frontmatter['depende'] = params['depende'].map(String)

  const input: TaskFileInput = { title, frontmatter }
  if (params['body'] !== undefined) input.body = String(params['body'])

  const result = await writeTaskFile(project.folderPath, input)

  ctx.notificationBus.publish({
    type: 'core.task.created',
    payload: { projectId: project.id, taskId: result.taskId, path: result.path },
    timestamp: new Date().toISOString(),
  })

  return { taskId: result.taskId, path: result.path }
}

export async function createProject(params: Record<string, unknown>, ctx: TavernaContext) {
  const id = String(params['id'])
  const result = await scaffoldProject(join(ctx.config.vaultPath, ctx.config.projectsDir), id)
  return { projectPath: result.projectPath }
}

export const taskCommands: CommandDef[] = [
  {
    id: 'get_task_status',
    description: "Returns a task's current status",
    params: {
      type: 'object',
      properties: { projectId: { type: 'string' }, taskId: { type: 'string' } },
      required: ['projectId', 'taskId'],
    },
    handler: getTaskStatus,
  },
  {
    id: 'archive_task',
    description: 'Moves a completed task to the project archive',
    params: {
      type: 'object',
      properties: { projectId: { type: 'string' }, taskId: { type: 'string' } },
      required: ['projectId', 'taskId'],
    },
    handler: archiveTask,
  },
  {
    id: 'add_task',
    description:
      'Creates a new task in a project; title is inferred from the canvas pipeline if omitted',
    params: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
        progresso: { type: 'number', minimum: 0, maximum: 100 },
        depende: { type: 'array', items: { type: 'string' } },
      },
      required: ['projectId'],
    },
    handler: addTask,
  },
  {
    id: 'create_project',
    description: "Creates a new project's folder structure in the vault",
    params: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    handler: createProject,
  },
]
