import { readdir, readFile, stat } from 'node:fs/promises'
import { join, basename, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { parseFrontmatter, getString, getPriority, getRunEvery, getStringArray } from './frontmatter.js'
import { readProjectTasks } from './task.js'
import type { VaultProject, ProjectType, RawFrontmatter, USPProject, BBProject, MetaProject } from './types.js'

// Add entries here to support new types or legacy aliases
const TIPO_ALIASES: Record<string, ProjectType> = {
  usp: 'USP',
  bb: 'BB',
  work: 'BB',   // legacy: type: work
  study: 'USP', // legacy: type: study
  '*': '*',
}

export function detectProjectType(
  folderName: string,
  fm: RawFrontmatter,
  uspPrefixes: string[],
): ProjectType {
  // 1. Explicit: `tipo: BB | USP | *` (preferred) or `type:` aliases
  const raw = getString(fm, 'tipo') ?? getString(fm, 'type')
  if (raw) {
    const mapped = TIPO_ALIASES[raw.toLowerCase().trim()]
    if (mapped) return mapped
  }

  // 2. Structural heuristics
  if (fm['cardId'] != null) return 'BB'
  if (uspPrefixes.some(p => folderName.startsWith(p))) return 'USP'

  // 3. Fallback
  return '*'
}

export async function readProject(
  filePath: string,
  uspPrefixes: string[],
): Promise<VaultProject> {
  const raw = await readFile(filePath, 'utf8')
  const { data, content } = parseFrontmatter(raw)

  const folderPath = existsSync(join(dirname(filePath), 'tasks'))
    || existsSync(join(dirname(filePath), 'assets'))
    ? dirname(filePath)
    : undefined

  // Use folder/file name for type detection (strip leading path)
  const stem = basename(filePath, '.md')
  const detectionName = folderPath ? basename(folderPath) : stem

  const id = getString(data, 'id') ?? detectionName
  const tipo = detectProjectType(detectionName, data, uspPrefixes)
  const priority = getPriority(data, 'priority')
  const runEvery = getRunEvery(data)
  const agent = getString(data, 'agent')
  const pipelineRaw = getStringArray(data, 'pipeline')
  const lastRun = getString(data, '_last_run')
  const lastStatusRaw = getString(data, '_last_status')
  const lastStatus = lastStatusRaw === 'success' || lastStatusRaw === 'failed' ? lastStatusRaw : undefined
  const runsTotal = typeof data['_runs_total'] === 'number' ? data['_runs_total'] : 0

  const actualFolderPath = dirname(filePath) !== filePath ? dirname(filePath) : undefined
  // For loose files, folderPath is undefined (they're directly in projectsDir)
  const resolvedFolderPath = folderPath

  const hasTasksFolder = resolvedFolderPath != null && existsSync(join(resolvedFolderPath, 'tasks'))
  const hasAssetsFolder = resolvedFolderPath != null && existsSync(join(resolvedFolderPath, 'assets'))
  const tasks = resolvedFolderPath != null ? await readProjectTasks(resolvedFolderPath) : []

  const base = {
    id,
    name: detectionName,
    filePath,
    ...(resolvedFolderPath != null ? { folderPath: resolvedFolderPath } : {}),
    priority,
    ...(agent != null ? { agent } : {}),
    ...(pipelineRaw.length > 0 ? { pipeline: pipelineRaw } : {}),
    runEvery,
    ...(lastRun != null ? { lastRun } : {}),
    ...(lastStatus != null ? { lastStatus } : {}),
    runsTotal,
    tasks,
    hasTasksFolder,
    hasAssetsFolder,
    content,
    raw: data,
  }

  if (tipo === 'USP') {
    const edisciplinas = getString(data, 'edisciplinas')
    return {
      ...base,
      tipo: 'USP',
      ...(edisciplinas != null ? { edisciplinas } : {}),
    } as USPProject
  }

  if (tipo === 'BB') {
    const cardId = getString(data, 'cardId')
    const sourceRaw = data['source']
    const source = Array.isArray(sourceRaw)
      ? sourceRaw.filter((x): x is string => typeof x === 'string')
      : undefined
    return {
      ...base,
      tipo: 'BB',
      ...(cardId != null ? { cardId } : {}),
      ...(source != null ? { source } : {}),
    } as BBProject
  }

  return { ...base, tipo: '*' } as MetaProject
}

export async function scanProjects(
  projectsDir: string,
  uspPrefixes: string[],
): Promise<VaultProject[]> {
  if (!existsSync(projectsDir)) return []

  const entries = await readdir(projectsDir)
  const projects: VaultProject[] = []

  for (const entry of entries) {
    if (entry.startsWith('.')) continue
    const fullPath = join(projectsDir, entry)
    const s = await stat(fullPath).catch(() => null)
    if (!s) continue

    if (s.isFile() && entry.endsWith('.md')) {
      // Loose .md file
      projects.push(await readProject(fullPath, uspPrefixes))
    } else if (s.isDirectory()) {
      // Folder project: must have folder/Folder.md
      const mainFile = join(fullPath, `${entry}.md`)
      if (existsSync(mainFile)) {
        projects.push(await readProject(mainFile, uspPrefixes))
      }
    }
  }

  return projects
}
