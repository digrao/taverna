import { z } from 'zod'
import type { CommandDef, TavernaContext } from './types.js'
import { scanVault } from '../vault/index.js'

function scanFor(ctx: TavernaContext) {
  return ctx.scan ? ctx.scan() : scanVault(ctx.config)
}

export const promptCommands: CommandDef[] = [
  {
    id: 'prompt_dry_run',
    description: 'Build the session prompt without executing — returns a PromptSnapshot',
    params: { id: z.string().describe('Project ID') },
    http: { method: 'GET', path: '/api/prompt/:id' },
    handler: async ({ id }, ctx) => {
      const { runSession } = await import('../pm/executor.js')
      const { planSession } = await import('../pm/session-planner.js')
      const state = await scanFor(ctx)
      const project = state.projects.find((p) => p.id === id || p.name === id)
      if (!project) throw new Error(`project "${String(id)}" not found`)

      const agentId = project.agent ?? ctx.config.agentDefaults[project.tipo]
      if (!agentId) throw new Error(`no agent configured for project ${String(id)}`)

      const agent = state.agents.find(
        (a) => a.id === agentId || a.folderName === agentId || `@${a.folderName}` === agentId,
      )
      if (!agent) throw new Error(`agent not found: ${agentId}`)

      const plan = planSession(project)
      if (plan.runnable.length === 0) throw new Error('no eligible tasks')

      const result = await runSession(
        { agent, project, tasks: plan.runnable },
        { dryRun: true, vaultPath: ctx.vaultPath },
      )

      return {
        project: String(id),
        agent: agent.id,
        char_total: result.output.length,
        task_count: plan.runnable.length,
        prompt: result.output,
      }
    },
  },

  {
    id: 'prompt_history',
    description: 'List recent prompt snapshots for a project (without prompt text)',
    params: { id: z.string().describe('Project ID') },
    http: { method: 'GET', path: '/api/prompt/:id/history' },
    handler: async ({ id }) => {
      const { listPromptHistory } = await import('../pm/prompt-store.js')
      return listPromptHistory(String(id))
    },
  },

  {
    id: 'prompt_diff',
    description: 'Unified diff between two saved prompt snapshots',
    params: {
      id: z.string().describe('Project ID'),
      a: z.string().describe('Timestamp of first snapshot (prefix match)'),
      b: z.string().describe('Timestamp of second snapshot (prefix match)'),
    },
    http: { method: 'GET', path: '/api/prompt/:id/diff' },
    handler: async ({ id, a, b }) => {
      const { getPromptSnapshot, diffPromptTexts } = await import('../pm/prompt-store.js')
      const snapA = getPromptSnapshot(String(id), String(a))
      const snapB = getPromptSnapshot(String(id), String(b))
      if (!snapA) throw new Error(`snapshot "${String(a)}" not found for ${String(id)}`)
      if (!snapB) throw new Error(`snapshot "${String(b)}" not found for ${String(id)}`)
      return {
        project: String(id),
        a: String(a),
        b: String(b),
        diff: diffPromptTexts(snapA.prompt, snapB.prompt),
      }
    },
  },
]
