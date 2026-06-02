import type { TavernaContext } from './types.js'
import { defaultTypePolicies } from '../pm/policies.js'
import { runScheduler } from '../pm/scheduler.js'
import { loadPlugins } from '../plugin/loader.js'

export async function runWork(
  params: { drain?: boolean; maxTasks?: number },
  ctx: TavernaContext,
): Promise<void> {
  const plugins = await loadPlugins()
  const typePolicies = defaultTypePolicies(ctx.config)
  await runScheduler(ctx.config, typePolicies, plugins, {
    ...(ctx.dryRun !== undefined ? { dryRun: ctx.dryRun } : {}),
    maxTasksPerProject: params.drain ? (params.maxTasks ?? 3) : 1,
  })
}
