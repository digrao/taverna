import { z } from 'zod'
import type { CommandDef, TavernaContext } from './types.js'
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
