import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import matter from 'gray-matter'
import { scanVault } from '../../vault/index.js'
import { getString } from '../../vault/frontmatter.js'
import type { VaultProject, VaultTask, RawFrontmatter } from '../../vault/types.js'
import type { TavernaContext, CommandDef } from '../types.js'
import { readFlow } from './canvas.js'
import { resolveRequiredFields } from './resolve.js'
import type { Flow, FlowState } from './types.js'

export { readFlow } from './canvas.js'
export { resolveTemplate } from './template.js'
export { resolveRequiredFields } from './resolve.js'
export type * from './types.js'
export type { ScopeChain, FieldPrompter, ResolveContext, ResolveResult } from './resolve.js'

async function findProject(ctx: TavernaContext, projectId: string): Promise<VaultProject> {
  const projects = await scanVault(ctx.config)
  const project = projects.find((p) => p.id === projectId || p.name === projectId)
  if (!project) throw new Error(`Project not found: ${projectId}`)
  return project
}

function findTask(project: VaultProject, taskId: string): VaultTask {
  const task = project.tasks.find((t) => t.id === taskId)
  if (!task) throw new Error(`Task not found: ${taskId} in ${project.id}`)
  return task
}

function findState(flow: Flow, id: string): FlowState | undefined {
  return flow.states.find((s) => s.id === id)
}

function nextStates(flow: Flow, id: string): string[] {
  return flow.transitions.filter((t) => t.from === id).map((t) => t.to)
}

function previousStates(flow: Flow, id: string): string[] {
  return flow.transitions.filter((t) => t.to === id).map((t) => t.from)
}

/** Counts existing `.md` items in a directory — backs the `%n` template sequence. */
export async function countExistingItems(dir: string): Promise<number> {
  if (!existsSync(dir)) return 0
  const entries = await readdir(dir)
  return entries.filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md').length
}

interface TransitionResult {
  previous: string | undefined
  current: string
  prompted: Record<string, string>
}

/**
 * Validates the requested transition, resolves the destination state's required
 * fields (infer → default → prompt), and writes the new status + resolved fields
 * to the item's frontmatter file. Nothing is written if any field can't be resolved.
 */
async function transition(
  ctx: TavernaContext,
  flowName: string,
  filePath: string,
  frontmatter: RawFrontmatter,
  scopes: Record<string, RawFrontmatter | undefined>,
  to: string,
  counter: number,
): Promise<TransitionResult> {
  const flow = await readFlow(join(ctx.config.vaultPath, ctx.config.flowDir), flowName)

  const previous = getString(frontmatter, 'status')
  const destination = findState(flow, to)
  if (!destination) throw new Error(`Unknown state "${to}" in flow "${flowName}"`)

  if (previous !== undefined && !nextStates(flow, previous).includes(to)) {
    throw new Error(`Invalid transition: "${previous}" → "${to}" is not an edge in flow "${flowName}"`)
  }

  const missing: string[] = []
  const prompt = ctx.prompt ?? (async (field: string) => { missing.push(field); return '' })
  const { resolved, prompted } = await resolveRequiredFields(
    { state: destination, frontmatter, scopes, counter },
    prompt,
  )

  if (missing.length > 0) {
    throw new Error(`Cannot transition to "${to}" — missing required fields: ${missing.join(', ')}`)
  }

  const raw = await readFile(filePath, 'utf8')
  const parsed = matter(raw)
  parsed.data['status'] = to
  for (const [field, value] of Object.entries(resolved)) parsed.data[field] = value
  await writeFile(filePath, matter.stringify(parsed.content, parsed.data), 'utf8')

  return { previous, current: to, prompted }
}

export async function getFlow(params: Record<string, unknown>, ctx: TavernaContext) {
  const flow = String(params['flow'])
  return readFlow(join(ctx.config.vaultPath, ctx.config.flowDir), flow)
}

export async function getFlowState(params: Record<string, unknown>, ctx: TavernaContext) {
  const projectId = String(params['projectId'])
  const taskId = params['taskId'] !== undefined ? String(params['taskId']) : undefined
  const project = await findProject(ctx, projectId)

  const flowName = taskId !== undefined ? 'task' : 'project'
  const item: VaultProject | VaultTask = taskId !== undefined ? findTask(project, taskId) : project
  const current = item.status

  const flow = await readFlow(join(ctx.config.vaultPath, ctx.config.flowDir), flowName)
  return {
    current,
    next: current !== undefined ? nextStates(flow, current) : [],
    previous: current !== undefined ? previousStates(flow, current) : [],
  }
}

export async function moveTask(params: Record<string, unknown>, ctx: TavernaContext) {
  const projectId = String(params['projectId'])
  const taskId = String(params['taskId'])
  const to = String(params['to'])

  const project = await findProject(ctx, projectId)
  const task = findTask(project, taskId)

  const result = await transition(
    ctx,
    'task',
    task.filePath,
    task.raw,
    { project: project.raw, task: task.raw },
    to,
    await countExistingItems(join(project.folderPath, 'tasks')),
  )

  ctx.notificationBus.publish({
    type: 'core.task.moved',
    payload: {
      projectId: project.id,
      taskId: task.id,
      previous: result.previous,
      current: result.current,
    },
    timestamp: new Date().toISOString(),
  })

  return result
}

export async function moveProject(params: Record<string, unknown>, ctx: TavernaContext) {
  const projectId = String(params['projectId'])
  const to = String(params['to'])

  const project = await findProject(ctx, projectId)

  const result = await transition(
    ctx,
    'project',
    project.filePath,
    project.raw,
    { project: project.raw },
    to,
    await countExistingItems(join(ctx.config.vaultPath, ctx.config.projectsDir)),
  )

  ctx.notificationBus.publish({
    type: 'core.project.moved',
    payload: { projectId: project.id, previous: result.previous, current: result.current },
    timestamp: new Date().toISOString(),
  })

  return result
}

export const flowCommands: CommandDef[] = [
  {
    id: 'get_flow',
    description:
      'Reads a flow canvas and returns its states, transitions, and per-state pipeline schema',
    params: {
      type: 'object',
      properties: { flow: { type: 'string' } },
      required: ['flow'],
    },
    handler: getFlow,
  },
  {
    id: 'get_flow_state',
    description: "Returns an item's current state and the states reachable from it",
    params: {
      type: 'object',
      properties: { projectId: { type: 'string' }, taskId: { type: 'string' } },
      required: ['projectId'],
    },
    handler: getFlowState,
  },
  {
    id: 'move_task',
    description:
      'Moves a task to another state in its flow, resolving pipeline fields before transitioning',
    params: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        taskId: { type: 'string' },
        to: { type: 'string' },
      },
      required: ['projectId', 'taskId', 'to'],
    },
    handler: moveTask,
  },
  {
    id: 'move_project',
    description:
      'Moves a project to another state in its flow, resolving pipeline fields before transitioning',
    params: {
      type: 'object',
      properties: { projectId: { type: 'string' }, to: { type: 'string' } },
      required: ['projectId', 'to'],
    },
    handler: moveProject,
  },
]
