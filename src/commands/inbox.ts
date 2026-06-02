import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import type { CommandDef, TavernaContext } from './types.js'
import { parseFrontmatter, getString } from '../vault/frontmatter.js'

export const inboxCommands: CommandDef[] = [
  {
    id: 'inbox',
    description: 'Pending agent-action-required items awaiting human input',
    params: {},
    http: { method: 'GET', path: '/inbox' },
    handler: async (_, ctx) => {
      const inboxDir = join(ctx.vaultPath, '00_Inbox')
      if (!existsSync(inboxDir)) return { count: 0, items: [] }

      const files = (await readdir(inboxDir)).filter((f) => f.endsWith('.md'))
      const items: Record<string, string | undefined>[] = []

      for (const file of files) {
        const raw = await readFile(join(inboxDir, file), 'utf8').catch(() => '')
        if (!raw) continue
        const { data } = parseFrontmatter(raw)
        if (data['tipo'] !== 'agent-action-required') continue
        items.push({
          arquivo: file,
          projeto: getString(data, 'projeto'),
          agente: getString(data, 'agente'),
          urgencia: getString(data, 'urgencia'),
          timestamp: getString(data, 'timestamp'),
        })
      }

      items.sort((a, b) => (b['timestamp'] ?? '').localeCompare(a['timestamp'] ?? ''))
      return { count: items.length, items }
    },
  },
]

export async function getInboxItems(ctx: TavernaContext) {
  const result = await inboxCommands[0]!.handler({}, ctx)
  return result as { count: number; items: Record<string, string | undefined>[] }
}
