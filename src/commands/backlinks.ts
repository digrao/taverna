import { join } from 'node:path'
import { z } from 'zod'
import type { CommandDef } from './types.js'
import { findBacklinks } from '../vault/backlinks.js'

export const backlinksCommands: CommandDef[] = [
  {
    id: 'backlinks',
    description: 'Find all vault files that link to a given note',
    params: { note: z.string().describe('Note name or path relative to vault root') },
    http: { method: 'GET', path: '/backlinks' },
    handler: async ({ note }, ctx) => {
      const n = String(note)
      const notePath = n.startsWith('/') ? n : join(ctx.vaultPath, n)
      const results = await findBacklinks(ctx.vaultPath, notePath)
      return { note, count: results.length, backlinks: results }
    },
  },
]
