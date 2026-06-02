import { spawnSync } from 'node:child_process'
import { z } from 'zod'
import type { CommandDef, TavernaContext } from './types.js'
import { scanVault } from '../vault/index.js'
import { isBlocked, hasCycle, resolveDependency } from '../vault/task.js'

function git(cwd: string, args: string[]): { ok: boolean; stdout: string } {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  return { ok: r.status === 0, stdout: r.stdout?.trim() ?? '' }
}

export async function showTaskStatus(
  params: { projectId: string },
  ctx: TavernaContext,
): Promise<void> {
  const vault = await scanVault(ctx.config)
  const project = vault.projects.find(
    (p) => p.id === params.projectId || p.name === params.projectId,
  )
  if (!project) throw new Error(`Project not found: ${params.projectId}`)

  const tasks = project.tasks
  const cycle = hasCycle(tasks)
  if (cycle) console.error('  warn: circular dependency detected')

  for (const task of tasks) {
    const pct = String(task.progresso).padStart(3, ' ')
    const { blocked } = isBlocked(task, tasks)

    if (!blocked) {
      console.log(`${task.filePath.replace(ctx.vaultPath + '/', '')}  [${pct}%] ✓`)
    } else {
      const depList = (task.depends ?? [])
        .map((depId) => {
          const dep = resolveDependency(depId, tasks)
          const ok = dep === undefined || dep.progresso === 100
          return `${depId} ${ok ? '✓' : '✗'}`
        })
        .join(', ')
      console.log(
        `${task.filePath.replace(ctx.vaultPath + '/', '')}  [${pct}%] BLOCKED por: ${depList}`,
      )
    }
  }

  if (project.isSubmodule && project.folderPath) {
    const dir = project.folderPath
    const hashRes = git(dir, ['rev-parse', '--short', 'HEAD'])
    const hash = hashRes.ok ? hashRes.stdout : '?'
    const isDirty = !git(dir, ['diff', '--quiet', 'HEAD']).ok

    // prefix from `git submodule status`: '+' = ahead of parent's recorded SHA, ' ' = in sync
    const subRes = git(ctx.vaultPath, ['submodule', 'status', '--', dir])
    const prefix = subRes.stdout[0] ?? ' '
    const syncState =
      prefix === '+' ? 'ahead of parent record (run git add to update)' : 'in sync with parent'

    console.log('')
    console.log('[submodule]')
    console.log(`  commit: ${hash}${isDirty ? ' (dirty)' : ''}`)
    console.log(`  sync:   ${syncState}`)
  }
}

export const statusCommands: CommandDef[] = [
  {
    id: 'status',
    description: 'Show task dependency tree and blocked tasks for a project',
    params: {
      projectId: z.string().describe('Project ID'),
    },
    handler: async (params, ctx) => {
      await showTaskStatus({ projectId: String(params['projectId']) }, ctx)
      return null
    },
  },
]
