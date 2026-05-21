import { readdir, readFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { existsSync } from 'node:fs'
import { parseFrontmatter, getProgress, getPriority, getString } from './frontmatter.js'
import type { VaultTask, TaskState, Priority } from './types.js'

export function progressToState(progresso: number): TaskState {
  if (progresso === 0) return 'tarefinha'
  if (progresso === 100) return 'concluida'
  if (progresso >= 50) return 'em-progresso'
  return 'tarefa'
}

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

function extractHeading(content: string): string | undefined {
  const match = content.match(/^#\s+(.+)$/m)
  return match?.[1]?.trim()
}

export async function readProjectTasks(projectFolderPath: string): Promise<VaultTask[]> {
  const tasksDir = join(projectFolderPath, 'tasks')
  if (!existsSync(tasksDir)) return []

  const entries = await readdir(tasksDir)
  const mdFiles = entries.filter(f => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')

  const tasks: VaultTask[] = []
  for (const file of mdFiles) {
    const filePath = join(tasksDir, file)
    const raw = await readFile(filePath, 'utf8')
    const { data, content } = parseFrontmatter(raw)
    const progresso = getProgress(data)
    const prioridade = getPriority(data, 'prioridade')
    const deadline = getString(data, 'deadline')
    const assetFolder = getString(data, 'asset_folder')
    const title = extractHeading(content) ?? basename(file, '.md')

    tasks.push({
      id: basename(file, '.md'),
      filePath,
      title,
      progresso,
      prioridade,
      ...(deadline !== undefined ? { deadline } : {}),
      ...(assetFolder !== undefined ? { assetFolder } : {}),
      state: progressToState(progresso),
      body: content.trim(),
      raw: data,
    })
  }

  return tasks.sort((a, b) => PRIORITY_ORDER[a.prioridade] - PRIORITY_ORDER[b.prioridade])
}
