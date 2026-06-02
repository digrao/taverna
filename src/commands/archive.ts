import { readdir, readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { join } from 'node:path'
import matter from 'gray-matter'
import { z } from 'zod'
import type { CommandDef, TavernaContext } from './types.js'

export async function archiveTask(
  params: { projectId: string; taskId: string },
  ctx: TavernaContext,
): Promise<{ archivedPath: string }> {
  const projectsDir = join(ctx.vaultPath, ctx.config.projectsDir)

  const entries = await readdir(join(projectsDir, params.projectId, 'tasks')).catch(
    () => [] as string[],
  )
  const match = entries.find(
    (f) => f.startsWith(params.taskId) && f.endsWith('.md') && !f.includes('archive'),
  )

  if (!match) {
    throw new Error(`Task not found: ${params.taskId} in ${params.projectId}/tasks/`)
  }

  const taskPath = join(projectsDir, params.projectId, 'tasks', match)
  const archiveDir = join(projectsDir, params.projectId, 'tasks', 'archive')
  const archivePath = join(archiveDir, match)

  const raw = await readFile(taskPath, 'utf8')
  const parsed = matter(raw)
  parsed.data['progresso'] = 100
  await mkdir(archiveDir, { recursive: true })
  await writeFile(taskPath, matter.stringify(parsed.content, parsed.data), 'utf8')
  await rename(taskPath, archivePath)

  return { archivedPath: archivePath }
}

export const archiveCommands: CommandDef[] = [
  {
    id: 'archive_task',
    description: 'Mark a task as done (progresso: 100) and move it to tasks/archive/',
    params: {
      projectId: z.string().describe('Project ID'),
      taskId: z.string().describe('Task ID prefix (partial match)'),
    },
    handler: (params, ctx) =>
      archiveTask(
        { projectId: String(params['projectId']), taskId: String(params['taskId']) },
        ctx,
      ),
  },
]
