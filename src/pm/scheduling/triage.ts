import type { VaultTask, VaultProject } from '../../vault/types.js'
import { isBlocked } from '../../vault/task.js'

export interface TriageEntry {
  task: VaultTask
  reason: string
}

export interface TriageResult {
  canRun: boolean
  runnable: VaultTask[]
  skipped: TriageEntry[]
}

export function triage(tasks: VaultTask[], project: VaultProject): TriageResult {
  const runnable: VaultTask[] = []
  const skipped: TriageEntry[] = []

  for (const task of tasks) {
    if (task.progresso >= 100) {
      skipped.push({ task, reason: 'já concluída' })
      continue
    }
    if (task.bloqueio) {
      skipped.push({ task, reason: `bloqueio: ${task.bloqueio}` })
      continue
    }
    if (task.requerHumano && task.requerHumano.length > 0) {
      skipped.push({ task, reason: `aguardando humano: ${task.requerHumano.join(', ')}` })
      continue
    }
    const { blocked, blockedBy } = isBlocked(task, project.tasks)
    if (blocked) {
      skipped.push({ task, reason: `depende de: ${blockedBy.join(', ')}` })
      continue
    }
    runnable.push(task)
  }

  return { canRun: runnable.length > 0, runnable, skipped }
}
