import type { WorkItem, TaskWorkItem, InboxWorkItem, DeferredWork, QueueResult } from './types.js'

function triageTask(item: TaskWorkItem): { ok: boolean; reason?: string } {
  const runnable = item.tasks.filter(
    (t) => t.progresso < 100 && !t.bloqueio && !t.requerHumano?.length,
  )
  if (runnable.length === 0) return { ok: false, reason: 'all tasks blocked or awaiting human' }
  return { ok: true }
}

function triageInbox(item: InboxWorkItem): { ok: boolean; reason?: string } {
  if (item.files.length === 0) return { ok: false, reason: 'empty inbox' }
  if (!item.directiveText.trim()) return { ok: false, reason: 'missing inbox directive' }
  return { ok: true }
}

function scoreInbox(item: InboxWorkItem): number {
  // Inbox sits below overdue tasks (score ~140+) but above idle projects (~0–30).
  // More unprocessed files nudge it upward, capped so it doesn't swamp active work.
  return Math.min(30 + item.files.length * 3, 60)
}

/**
 * Filters and orders WorkItems for dispatch.
 * Pure function — no I/O. Assign scores, exclude blocked items, sort descending.
 */
export function triage(items: WorkItem[]): QueueResult {
  const dispatchable: WorkItem[] = []
  const deferred: DeferredWork[] = []

  for (const item of items) {
    if (item.kind === 'task') {
      const result = triageTask(item)
      if (result.ok) dispatchable.push(item)
      else deferred.push({ item, reason: result.reason ?? 'skip' })
    } else if (item.kind === 'inbox') {
      const result = triageInbox(item)
      if (result.ok) dispatchable.push({ ...item, score: scoreInbox(item) })
      else deferred.push({ item, reason: result.reason ?? 'skip' })
    } else {
      // agenda — placeholder, always defer until source is implemented
      deferred.push({ item, reason: 'agenda dispatch not yet implemented' })
    }
  }

  dispatchable.sort((a, b) => b.score - a.score)
  return { dispatchable, deferred }
}
