import type { TavernaContext } from './types.js'
import { scanVault } from '../vault/index.js'
import { isBlocked, hasCycle, resolveDependency } from '../vault/task.js'

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
}
