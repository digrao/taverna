import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import matter from 'gray-matter'
import { rankProjects } from '../scheduling/scorer.js'
import { planSession } from '../scheduling/session-planner.js'
import { scanInbox, MAX_CHARS_PER_RUN } from '../../vault/inbox/process.js'
import type { TavernaConfig } from '../../config.js'
import type { VaultState } from '../../vault/types.js'
import type { TaskWorkItem, InboxWorkItem, WorkItem } from './types.js'

export function collectTasks(vault: VaultState, config: TavernaConfig): TaskWorkItem[] {
  const ranked = rankProjects(vault.projects, config.agentDefaults, { now: new Date() })
  const items: TaskWorkItem[] = []
  for (const { project, agentId, score } of ranked) {
    const plan = planSession(project)
    if (plan.runnable.length === 0) continue
    items.push({
      kind: 'task',
      score,
      agent: agentId,
      projectId: project.id,
      project,
      tasks: plan.runnable,
    })
  }
  return items
}

export async function collectInbox(config: TavernaConfig): Promise<InboxWorkItem | null> {
  const inboxDir = join(config.vaultPath, '00_Inbox')
  const directivesPath = join(
    config.vaultPath,
    config.directivesDir,
    'inbox-manager',
    'directives.md',
  )
  if (!existsSync(directivesPath)) return null
  const allFiles = await scanInbox(inboxDir)
  if (allFiles.length === 0) return null
  const raw = await readFile(directivesPath, 'utf8')
  const { content: directiveText } = matter(raw)
  const agentId = config.agentDefaults['inbox'] ?? '@inbox-manager'
  return {
    kind: 'inbox',
    score: 0,
    agent: agentId,
    files: allFiles,
    directiveText,
    maxChars: MAX_CHARS_PER_RUN,
  }
}

export async function collect(vault: VaultState, config: TavernaConfig): Promise<WorkItem[]> {
  const tasks = collectTasks(vault, config)
  const inbox = await collectInbox(config)
  return inbox ? [...tasks, inbox] : tasks
}
