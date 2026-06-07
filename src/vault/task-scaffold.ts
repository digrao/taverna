import { writeFile, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import matter from 'gray-matter'
import type { RawFrontmatter } from './types.js'

// NFD decomposes accented chars; strip all combining marks, then lowercase and slugify
export function slugify(text: string): string {
  const slug = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 50)

  return slug || 'task'
}

async function nextTaskNumber(tasksDir: string): Promise<number> {
  let max = 0
  for (const dir of [tasksDir, join(tasksDir, 'archive')]) {
    let entries: string[]
    try {
      entries = (await readdir(dir)).filter((n) => n.endsWith('.md'))
    } catch {
      continue
    }
    for (const name of entries) {
      const m = name.match(/^(\d+)-/)
      if (m?.[1]) max = Math.max(max, parseInt(m[1], 10))
    }
  }
  return max + 1
}

export interface TaskFileInput {
  title: string
  body?: string
  frontmatter?: RawFrontmatter
}

export interface TaskFileResult {
  taskId: string
  path: string
}

/** Writes a new task file under <project>/tasks, numbered sequentially and slugified from the title. */
export async function writeTaskFile(
  projectFolderPath: string,
  input: TaskFileInput,
): Promise<TaskFileResult> {
  const tasksDir = join(projectFolderPath, 'tasks')
  await mkdir(tasksDir, { recursive: true })

  const n = await nextTaskNumber(tasksDir)
  const taskId = `${n}-${slugify(input.title)}`
  const path = join(tasksDir, `${taskId}.md`)

  const body = `\n# ${input.title}\n${input.body ? `\n${input.body}\n` : ''}`
  const content = matter.stringify(body, input.frontmatter ?? {})
  await writeFile(path, content, 'utf8')

  return { taskId, path }
}
