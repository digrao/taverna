import { spawnSync } from 'node:child_process'
import { relative } from 'node:path'
import type { CommandDef, TavernaContext } from './types.js'
import { scanVault } from '../vault/index.js'

interface SyncResult {
  project: string
  path: string
  ok: boolean
  before: string
  after: string
}

function git(cwd: string, args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  return { ok: r.status === 0, stdout: r.stdout?.trim() ?? '', stderr: r.stderr?.trim() ?? '' }
}

export async function runSync(ctx: TavernaContext): Promise<SyncResult[]> {
  const vault = await scanVault(ctx.config)
  const submodules = vault.projects.filter((p) => p.isSubmodule && p.folderPath)

  if (submodules.length === 0) {
    console.log('No submodule projects found.')
    return []
  }

  const results: SyncResult[] = []

  for (const project of submodules) {
    const relPath = relative(ctx.vaultPath, project.folderPath!)
    const dir = project.folderPath!

    const beforeHash = git(dir, ['rev-parse', '--short', 'HEAD'])
    const before = beforeHash.ok ? beforeHash.stdout : '?'

    const isDirty = !git(dir, ['diff', '--quiet', 'HEAD']).ok
    if (isDirty) {
      console.log(`  skip ${project.id} — dirty working tree`)
      results.push({ project: project.id, path: relPath, ok: false, before, after: before })
      continue
    }

    const update = git(ctx.vaultPath, ['submodule', 'update', '--remote', '--merge', '--', relPath])

    const afterHash = git(dir, ['rev-parse', '--short', 'HEAD'])
    const after = afterHash.ok ? afterHash.stdout : '?'

    const icon = update.ok ? '✓' : '✗'
    const detail = before !== after ? `${before} → ${after}` : 'already up to date'
    console.log(`${icon} ${project.id.padEnd(24)}  ${detail}`)
    if (!update.ok && update.stderr) console.error(`  ${update.stderr}`)

    results.push({ project: project.id, path: relPath, ok: update.ok, before, after })
  }

  return results
}

export const syncCommands: CommandDef[] = [
  {
    id: 'sync',
    description: 'Update all git submodule projects to their latest remote commit',
    params: {},
    handler: async (_, ctx) => {
      const results = await runSync(ctx)
      return results.length === 0
        ? null
        : { synced: results.filter((r) => r.ok).length, total: results.length }
    },
  },
]
