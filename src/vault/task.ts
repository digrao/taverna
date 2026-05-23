import { readdir, readFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { existsSync } from 'node:fs'
import { parseFrontmatter, getProgress, getPriority, getString, getStringArray, getPipelineStage } from './frontmatter.js'
import type { VaultTask, TaskState, Priority, RawFrontmatter, UspTaskType } from './types.js'

export function progressToState(progresso: number): TaskState {
  if (progresso === 0) return 'tarefinha'
  if (progresso === 100) return 'concluida'
  if (progresso >= 50) return 'em-progresso'
  return 'tarefa'
}

export function deriveTaskState(progresso: number, raw: RawFrontmatter): TaskState {
  if (progresso === 100) return 'concluida'
  if (raw['bloqueio'] != null) return 'bloqueada'
  const requerHumano = getStringArray(raw, 'requer_humano')
  if (requerHumano.length > 0 && progresso > 0) return 'aguardando_humano'
  return progressToState(progresso)
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
    const requerHumano = getStringArray(data, 'requer_humano')
    const bloqueio = getString(data, 'bloqueio')
    const bloqueioDetalhe = getString(data, 'bloqueio_detalhe')

    // supports both legacy `depende:` and new `depends_on:`
    const depends = [
      ...getStringArray(data, 'depende'),
      ...getStringArray(data, 'depends_on'),
    ].filter(Boolean)

    const rawType = getString(data, 'type')
    const taskType: UspTaskType | undefined =
      rawType === 'USP-aula' || rawType === 'USP-entrega' ? rawType : undefined
    const pipelineStage = getPipelineStage(data)
    const workspace = getString(data, 'workspace')
    const parent = getString(data, 'parent')

    tasks.push({
      id: basename(file, '.md'),
      filePath,
      title,
      progresso,
      prioridade,
      ...(deadline !== undefined ? { deadline } : {}),
      ...(assetFolder !== undefined ? { assetFolder } : {}),
      ...(taskType !== undefined ? { taskType } : {}),
      ...(pipelineStage !== undefined ? { pipelineStage } : {}),
      ...(workspace !== undefined ? { workspace } : {}),
      ...(parent !== undefined ? { parent } : {}),
      ...(requerHumano.length > 0 ? { requerHumano } : {}),
      ...(bloqueio !== undefined ? { bloqueio } : {}),
      ...(bloqueioDetalhe !== undefined ? { bloqueioDetalhe } : {}),
      ...(depends.length > 0 ? { depends } : {}),
      state: deriveTaskState(progresso, data),
      body: content.trim(),
      raw: data,
    })
  }

  return tasks.sort((a, b) => PRIORITY_ORDER[a.prioridade] - PRIORITY_ORDER[b.prioridade])
}

// Resolves a dep ID ("07" or "07-scheduler-module") to a task from allTasks.
// An archived (not in allTasks) dep returns undefined — treated as satisfied by the caller.
export function resolveDependency(depId: string, allTasks: VaultTask[]): VaultTask | undefined {
  return allTasks.find(t => t.id === depId || t.id.startsWith(depId + '-'))
}

export interface BlockedInfo {
  blocked: boolean
  blockedBy: string[]  // dep IDs that are not yet at 100%
}

// A task is blocked if any of its declared deps is found in allTasks with progresso < 100.
// Deps not found in allTasks are assumed satisfied (archived/completed).
export function isBlocked(task: VaultTask, allTasks: VaultTask[]): BlockedInfo {
  if (!task.depends || task.depends.length === 0) return { blocked: false, blockedBy: [] }
  const blockedBy: string[] = []
  for (const depId of task.depends) {
    const dep = resolveDependency(depId, allTasks)
    if (dep !== undefined && dep.progresso < 100) {
      blockedBy.push(depId)
    }
  }
  return { blocked: blockedBy.length > 0, blockedBy }
}

function dfs(taskId: string, taskMap: Map<string, VaultTask>, visited: Set<string>, stack: Set<string>): boolean {
  visited.add(taskId)
  stack.add(taskId)
  const task = taskMap.get(taskId)
  for (const depId of task?.depends ?? []) {
    const dep = resolveDependency(depId, [...taskMap.values()])
    if (!dep) continue
    if (!visited.has(dep.id)) {
      if (dfs(dep.id, taskMap, visited, stack)) return true
    } else if (stack.has(dep.id)) {
      return true
    }
  }
  stack.delete(taskId)
  return false
}

export function hasCycle(tasks: VaultTask[]): boolean {
  const taskMap = new Map(tasks.map(t => [t.id, t]))
  const visited = new Set<string>()
  const stack = new Set<string>()
  for (const t of tasks) {
    if (!visited.has(t.id)) {
      if (dfs(t.id, taskMap, visited, stack)) return true
    }
  }
  return false
}
