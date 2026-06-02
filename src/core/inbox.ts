import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { parseFrontmatter, getString } from '../vault/frontmatter.js'
import { scanVault } from '../vault/index.js'
import type { TavernaContext, CommandDef } from './types.js'

export async function getInboxItems(_params: Record<string, unknown>, ctx: TavernaContext) {
  const inboxDir = join(ctx.vaultPath, '00_Inbox')
  const actionRequired: Record<string, string | undefined>[] = []

  if (existsSync(inboxDir)) {
    const files = (await readdir(inboxDir)).filter((f) => f.endsWith('.md'))
    for (const file of files) {
      const raw = await readFile(join(inboxDir, file), 'utf8').catch(() => '')
      if (!raw) continue
      const { data } = parseFrontmatter(raw)
      if (data['tipo'] !== 'agent-action-required') continue
      actionRequired.push({
        arquivo: file,
        projeto: getString(data, 'projeto'),
        agente: getString(data, 'agente'),
        urgencia: getString(data, 'urgencia'),
        timestamp: getString(data, 'timestamp'),
      })
    }
    actionRequired.sort((a, b) => (b['timestamp'] ?? '').localeCompare(a['timestamp'] ?? ''))
  }

  const vault = await scanVault(ctx.config)
  const humanTasks: { project: string; task: string; title: string; priority: string }[] = []

  for (const project of vault.projects) {
    for (const task of project.tasks) {
      if (task.progresso >= 100) continue
      if (task.assignee === 'human') {
        humanTasks.push({
          project: project.id,
          task: task.id,
          title: task.title,
          priority: task.prioridade,
        })
      }
    }
  }

  return {
    actionRequired: { count: actionRequired.length, items: actionRequired },
    humanTasks: { count: humanTasks.length, items: humanTasks },
  }
}

export const inboxCommands: CommandDef[] = [
  {
    id: 'inbox',
    description:
      'Pending items awaiting human action: agent-action-required notices and human-assigned tasks',
    params: {},
    http: { method: 'GET', path: '/inbox' },
    handler: getInboxItems,
  },
]
