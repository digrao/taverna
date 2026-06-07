import { readdir, readFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { existsSync } from 'node:fs'
import { parseFrontmatter, getProgress, getString, getStringArray } from './frontmatter.js'
import type { VaultTask } from './types.js'

function extractHeading(content: string): string | undefined {
  const match = content.match(/^#\s+(.+)$/m)
  return match?.[1]?.trim()
}

export async function readProjectTasks(projectFolderPath: string): Promise<VaultTask[]> {
  const tasksDir = join(projectFolderPath, 'tasks')
  if (!existsSync(tasksDir)) return []

  const entries = await readdir(tasksDir)
  const mdFiles = entries.filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')

  const tasks: VaultTask[] = []
  for (const file of mdFiles) {
    const filePath = join(tasksDir, file)
    const raw = await readFile(filePath, 'utf8')
    const { data, content } = parseFrontmatter(raw)
    const progresso = getProgress(data)
    const status = getString(data, 'status')
    const title = extractHeading(content) ?? basename(file, '.md')
    const depends = getStringArray(data, 'depende')

    tasks.push({
      id: basename(file, '.md'),
      filePath,
      title,
      progresso,
      ...(status !== undefined ? { status } : {}),
      ...(depends.length > 0 ? { depends } : {}),
      body: content.trim(),
      raw: data,
    })
  }

  return tasks
}
