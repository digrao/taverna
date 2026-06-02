import { readdir, readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import matter from 'gray-matter'
import { scanVault } from '../vault/index.js'
import { isBlocked, hasCycle, resolveDependency } from '../vault/task.js'
import type { TavernaContext, CommandDef } from './types.js'

export async function archiveTask(
  params: Record<string, unknown>,
  ctx: TavernaContext,
): Promise<{ archivedPath: string }> {
  const projectId = String(params['projectId'])
  const taskId = String(params['taskId'])
  const projectsDir = join(ctx.vaultPath, ctx.config.projectsDir)

  const entries = await readdir(join(projectsDir, projectId, 'tasks')).catch(() => [] as string[])
  const match = entries.find(
    (f) => f.startsWith(taskId) && f.endsWith('.md') && !f.includes('archive'),
  )

  if (!match) {
    throw new Error(`Task not found: ${taskId} in ${projectId}/tasks/`)
  }

  const taskPath = join(projectsDir, projectId, 'tasks', match)
  const archiveDir = join(projectsDir, projectId, 'tasks', 'archive')
  const archivePath = join(archiveDir, match)

  const raw = await readFile(taskPath, 'utf8')
  const parsed = matter(raw)
  parsed.data['progresso'] = 100
  await mkdir(archiveDir, { recursive: true })
  await writeFile(taskPath, matter.stringify(parsed.content, parsed.data), 'utf8')
  await rename(taskPath, archivePath)

  return { archivedPath: archivePath }
}

export async function getTaskStatus(params: Record<string, unknown>, ctx: TavernaContext) {
  const vault = await scanVault(ctx.config)
  const projectId = String(params['projectId'])
  const project = vault.projects.find((p) => p.id === projectId || p.name === projectId)
  if (!project) throw new Error(`Project not found: ${projectId}`)

  return {
    projectId: project.id,
    hasCycle: hasCycle(project.tasks),
    tasks: project.tasks.map((task) => {
      const { blocked } = isBlocked(task, project.tasks)
      return {
        id: task.id,
        title: task.title,
        progresso: task.progresso,
        blocked,
        depends: (task.depends ?? []).map((depId) => {
          const dep = resolveDependency(depId, project.tasks)
          return { id: depId, done: dep === undefined || dep.progresso === 100 }
        }),
      }
    }),
  }
}

export const tasksCommands: CommandDef[] = [
  {
    id: 'archive_task',
    description: 'Mark a task as done (progresso: 100) and move it to tasks/archive/',
    params: {
      projectId: z.string().describe('Project ID'),
      taskId: z.string().describe('Task ID prefix (partial match)'),
    },
    http: { method: 'POST', path: '/tasks/:projectId/archive' },
    handler: archiveTask,
  },
  {
    id: 'task_status',
    description: 'Task dependency tree for a project — shows which tasks are blocked and why',
    params: { projectId: z.string().describe('Project ID') },
    http: { method: 'GET', path: '/tasks/:projectId/status' },
    handler: getTaskStatus,
  },
]
