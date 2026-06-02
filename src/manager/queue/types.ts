import type { VaultProject, VaultTask } from '../../vault/types.js'
import type { InboxFile } from '../../vault/inbox/process.js'

export type WorkKind = 'task' | 'inbox' | 'agenda'

export interface TaskWorkItem {
  kind: 'task'
  score: number
  agent: string
  projectId: string
  project: VaultProject
  tasks: VaultTask[]
}

export interface InboxWorkItem {
  kind: 'inbox'
  score: number
  agent: string
  files: InboxFile[]
  directiveText: string
  maxChars: number
}

export interface AgendaWorkItem {
  kind: 'agenda'
  score: number
  agent: string
  projectId?: string
  events: unknown[]
}

export type WorkItem = TaskWorkItem | InboxWorkItem | AgendaWorkItem

export interface DeferredWork {
  item: WorkItem
  reason: string
}

export interface QueueResult {
  dispatchable: WorkItem[]
  deferred: DeferredWork[]
}
