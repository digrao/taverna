import { readdir, readFile, stat } from 'node:fs/promises'
import { join, basename, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import {
  parseFrontmatter,
  getString,
  getPriority,
  getRunEvery,
  getStringArray,
} from './frontmatter.js'
import { readProjectTasks } from './task.js'
import type { VaultProject, ProjectType, RawFrontmatter } from './types.js'

// Add entries here to support new types or legacy aliases
const TIPO_ALIASES: Record<string, ProjectType> = {
  usp: 'USP',
  bb: 'BB',
  work: 'BB', // legacy: type: work
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
  if (uspPrefixes.some((p) => folderName.startsWith(p))) return 'USP'

  // 3. Fallback
  return '*'
}

export async function readProject(filePath: string, uspPrefixes: string[]): Promise<VaultProject> {
  const raw = await readFile(filePath, 'utf8')
  const { data, content } = parseFrontmatter(raw)

  const folderPath = dirname(filePath)
  const detectionName = basename(folderPath)

  const id = getString(data, 'id') ?? detectionName
  const tipo = detectProjectType(detectionName, data, uspPrefixes)
  const priority = getPriority(data, 'priority')
  const runEvery = getRunEvery(data)
  const agent = getString(data, 'agent')
  const pipelineRaw = getStringArray(data, 'pipeline')
  const lastRun = getString(data, '_last_run')
  const lastStatusRaw = getString(data, '_last_status')
  const lastStatus =
    lastStatusRaw === 'success' || lastStatusRaw === 'failed' ? lastStatusRaw : undefined
  const runsTotal = typeof data['_runs_total'] === 'number' ? data['_runs_total'] : 0

  const hasTasksFolder = existsSync(join(folderPath, 'tasks'))
  const hasAssetsFolder = existsSync(join(folderPath, 'assets'))
  const gitEntry = join(folderPath, '.git')
  const isGitRepo = existsSync(gitEntry)
  const gitEntryStat = isGitRepo ? await stat(gitEntry).catch(() => null) : null
  // In git submodules the .git entry is a file (pointing to the parent .git/modules/),
  // not a directory as in regular repos.
  const isSubmodule = gitEntryStat?.isFile() ?? false
  const tasks = await readProjectTasks(folderPath)

  const hostname = getString(data, 'hostname')
  const workspaceDir = getString(data, 'workspace_dir') ?? getString(data, 'workspaceDir')

  const edisciplinas = getString(data, 'edisciplinas')
  const contatos = getStringArray(data, 'contatos')
  const horariosRaw = data['horarios']
  const horarios = Array.isArray(horariosRaw)
    ? horariosRaw
        .filter((h): h is Record<string, unknown> => h != null && typeof h === 'object')
        .map((h) => ({
          dia: typeof h['dia'] === 'string' ? h['dia'] : '',
          ...(typeof h['hora'] === 'string' ? { hora: h['hora'] } : {}),
          ...(typeof h['local'] === 'string' ? { local: h['local'] } : {}),
        }))
        .filter((h) => h.dia !== '')
    : undefined

  const cardId = getString(data, 'cardId')
  const sourceRaw = data['source']
  const source = Array.isArray(sourceRaw)
    ? sourceRaw.filter((x): x is string => typeof x === 'string')
    : undefined

  return {
    id,
    tipo,
    name: detectionName,
    filePath,
    folderPath,
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
    isGitRepo,
    isSubmodule,
    content,
    raw: data,
    ...(hostname ? { hostname } : {}),
    ...(workspaceDir ? { workspaceDir } : {}),
    ...(edisciplinas != null ? { edisciplinas } : {}),
    ...(contatos.length > 0 ? { contatos } : {}),
    ...(horarios?.length ? { horarios } : {}),
    ...(cardId != null ? { cardId } : {}),
    ...(source?.length ? { source } : {}),
  }
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
      projects.push(await readProject(mainFile, uspPrefixes))
    }
  }

  return projects
}
