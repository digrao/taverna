import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { CommandDef, TavernaContext } from './types.js'
import { emitEvent } from '../pm/observability/index.js'

export async function emitDigest(
  _params: Record<string, unknown>,
  ctx: TavernaContext,
): Promise<{ inbox: number; zettelkasten: number; projects: number }> {
  const [inboxEntries, zettelEntries, projectEntries] = await Promise.all([
    readdir(join(ctx.vaultPath, '00_Inbox'), { withFileTypes: true }),
    readdir(join(ctx.vaultPath, '00_Zettelkasten'), { withFileTypes: true }),
    readdir(join(ctx.vaultPath, '10_Projects'), { withFileTypes: true }),
  ])

  const counts = {
    inbox: inboxEntries.filter((e) => e.isFile()).length,
    zettelkasten: zettelEntries.filter((e) => e.isFile()).length,
    projects: projectEntries.filter((e) => e.isDirectory()).length,
  }

  emitEvent({ event: 'vault_snapshot', ...counts })

  return counts
}

export const insightsCommands: CommandDef[] = [
  {
    id: 'digest',
    description: 'Count inbox, zettelkasten, and project entries in the vault',
    params: {},
    handler: (_, ctx) => emitDigest({}, ctx),
  },
]
