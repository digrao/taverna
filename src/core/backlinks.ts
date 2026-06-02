import { join } from 'node:path'
import { z } from 'zod'
import { findBacklinks } from '../vault/backlinks.js'
import type { TavernaContext, CommandDef } from './types.js'

export async function getBacklinks(params: Record<string, unknown>, ctx: TavernaContext) {
  const note = String(params['note'])
  const notePath = note.startsWith('/') ? note : join(ctx.vaultPath, note)
  const results = await findBacklinks(ctx.vaultPath, notePath)
  return { note, count: results.length, backlinks: results }
}

export const backlinksCommands: CommandDef[] = [
  {
    id: 'backlinks',
    description: 'Find all vault files that link to a given note',
    params: { note: z.string().describe('Note name or path relative to vault root') },
    http: { method: 'GET', path: '/backlinks' },
    handler: getBacklinks,
  },
]
