import { z } from 'zod'
import type { CommandDef, TavernaContext } from './types.js'
import { defaultTypePolicies } from '../pm/scheduling/index.js'
import { runScheduler } from '../pm/engine/index.js'
import { loadPlugins } from '../plugin/loader.js'
import type { SchedulingPlugins } from '../pm/scheduling/plugins.js'

export async function runWork(
  params: { drain?: boolean; maxTasks?: number },
  ctx: TavernaContext,
): Promise<void> {
  const plugins = await loadPlugins()
  const typePolicies = defaultTypePolicies(ctx.config)

  const schedulingPlugins: SchedulingPlugins = {}
  for (const p of plugins) {
    if (p.scheduling?.scoring !== undefined) schedulingPlugins.scoring = p.scheduling.scoring
    if (p.scheduling?.triage !== undefined) schedulingPlugins.triage = p.scheduling.triage
    if (p.scheduling?.permissions !== undefined)
      schedulingPlugins.permissions = p.scheduling.permissions
  }

  await runScheduler(ctx.config, typePolicies, plugins, {
    ...(ctx.dryRun !== undefined ? { dryRun: ctx.dryRun } : {}),
    maxTasksPerProject: params.drain ? (params.maxTasks ?? 3) : 1,
    ...(Object.keys(schedulingPlugins).length > 0 ? { schedulingPlugins } : {}),
  })
}

export const workCommands: CommandDef[] = [
  {
    id: 'work',
    description: 'Dispatch agents on all eligible projects and exit (one-shot)',
    params: {
      drain: z.boolean().optional().describe('Run tasks sequentially per project'),
      maxTasks: z.number().int().optional().describe('Max tasks per project (default: 3)'),
    },
    handler: async (params, ctx) => {
      await runWork(
        {
          ...(params['drain'] !== undefined ? { drain: params['drain'] as boolean } : {}),
          ...(params['maxTasks'] !== undefined ? { maxTasks: params['maxTasks'] as number } : {}),
        },
        ctx,
      )
      return null
    },
  },
]
