import { readdir, readFile, stat } from 'node:fs/promises'
import { join, basename, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { parseFrontmatter, getString } from './frontmatter.js'
import { readProjectTasks } from './task.js'
import type { VaultProject } from './types.js'

export async function readProject(filePath: string): Promise<VaultProject> {
  const raw = await readFile(filePath, 'utf8')
  const { data, content } = parseFrontmatter(raw)

  const folderPath = dirname(filePath)
  const name = basename(folderPath)
  const id = getString(data, 'id') ?? name
  const tipo = getString(data, 'tipo')
  const status = getString(data, 'status')
  const tasks = await readProjectTasks(folderPath)

  return {
    id,
    name,
    filePath,
    folderPath,
    ...(tipo !== undefined ? { tipo } : {}),
    ...(status !== undefined ? { status } : {}),
    tasks,
    content,
    raw: data,
  }
}

export async function scanProjects(projectsDir: string): Promise<VaultProject[]> {
  if (!existsSync(projectsDir)) return []

  const entries = await readdir(projectsDir)
  const projects: VaultProject[] = []

  for (const entry of entries) {
    if (entry.startsWith('.')) continue
    const fullPath = join(projectsDir, entry)
    const s = await stat(fullPath).catch(() => null)
    if (!s?.isDirectory()) continue

    // Prefer README.md; fall back to <id>.md for projects not yet migrated
    const readmePath = join(fullPath, 'README.md')
    const legacyPath = join(fullPath, `${entry}.md`)
    const mainFile = existsSync(readmePath)
      ? readmePath
      : existsSync(legacyPath)
        ? legacyPath
        : null
    if (mainFile) {
      projects.push(await readProject(mainFile))
    }
  }

  return projects
}
