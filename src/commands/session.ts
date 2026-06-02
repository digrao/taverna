import { z } from 'zod'
import { spawn } from 'node:child_process'
import type { CommandDef, TavernaContext } from './types.js'
import { scanVault, appendLogbook, updateProjectStatus } from '../vault/index.js'
import { isBlocked } from '../vault/task.js'
import { runSession } from '../pm/engine/index.js'
import type { AgentResult } from '../pm/engine/index.js'
import type { VaultTask } from '../vault/types.js'

function scanFor(ctx: TavernaContext) {
  return ctx.scan ? ctx.scan() : scanVault(ctx.config)
}

function spawnTaverna(args: string[]): void {
  const proc = spawn('taverna', args, {
    stdio: 'ignore',
    detached: true,
    env: { ...process.env },
  })
  proc.unref()
}

export const sessionCommands: CommandDef[] = [
  {
    id: 'session_preview',
    description: 'Show eligible unblocked tasks grouped by project for batched session execution',
    params: { project: z.string().optional().describe('Filter to a specific project ID') },
    http: { method: 'GET', path: '/api/session/preview' },
    handler: async ({ project }, ctx) => {
      const state = await scanFor(ctx)
      const projects = project
        ? state.projects.filter((p) => p.id === project || p.name === project)
        : state.projects
      const result = projects
        .map((p) => ({
          project: p.id,
          agent: p.agent ?? '',
          tasks: p.tasks
            .filter((t) => t.progresso < 100)
            .filter((t) => !isBlocked(t, p.tasks).blocked)
            .map((t) => ({
              id: t.id,
              title: t.title,
              progresso: t.progresso,
              prioridade: t.prioridade,
            })),
        }))
        .filter((p) => p.tasks.length > 0)
      return { projects: result, total: result.reduce((s, p) => s + p.tasks.length, 0) }
    },
  },

  {
    id: 'session_run',
    description:
      'Launch a batched agent session — all eligible tasks run in one context window to maximise cache reuse',
    params: {
      project: z.string().describe('Project ID'),
      tasks: z
        .string()
        .optional()
        .describe('Comma-separated task IDs to include (default: all unblocked pending)'),
    },
    http: { method: 'POST', path: '/api/session/run' },
    handler: async ({ project, tasks }) => {
      const args = ['session', 'run', '--project', String(project)]
      if (tasks) args.push('--tasks', String(tasks))
      spawnTaverna(args)
      return {
        started: true,
        message: `taverna session run iniciado para projeto ${String(project)}`,
      }
    },
  },
]

/** Execute a session directly — used by CLI `session run`. */
export async function executeSessionRun(
  params: {
    projectId: string
    taskIds?: string[]
    maxChars?: number
    timeout?: number
  },
  ctx: TavernaContext,
): Promise<AgentResult> {
  const vault = await scanVault(ctx.config)
  const project = vault.projects.find(
    (p) => p.id === params.projectId || p.name === params.projectId,
  )
  if (!project) throw new Error(`Project not found: ${params.projectId}`)

  const agentId = project.agent ?? ctx.config.agentDefaults[project.tipo]
  if (!agentId) throw new Error(`No agent configured for project ${project.id}`)

  const agent = vault.agents.find(
    (a) => a.id === agentId || a.folderName === agentId || `@${a.folderName}` === agentId,
  )
  if (!agent) throw new Error(`Agent not found: ${agentId}`)

  const allUnblocked = project.tasks
    .filter((t) => t.progresso < 100)
    .filter((t) => !isBlocked(t, project.tasks).blocked)

  const sessionTasks: VaultTask[] = params.taskIds
    ? allUnblocked.filter((t) => params.taskIds!.includes(t.id))
    : allUnblocked

  if (sessionTasks.length === 0) throw new Error('No eligible tasks for session')

  const result = await runSession(
    { agent, project, tasks: sessionTasks },
    {
      maxContextChars: params.maxChars ?? 8000,
      timeoutMs: params.timeout ?? 600_000,
      vaultPath: ctx.vaultPath,
      dryRun: ctx.dryRun ?? false,
    },
  )

  if (result.success && !ctx.dryRun) {
    await updateProjectStatus(project.filePath, {
      lastRun: new Date().toISOString(),
      lastStatus: 'success',
      runsTotal: project.runsTotal + 1,
    })
    await appendLogbook(
      agent.id,
      {
        projectName: project.id,
        content: [
          `**Session:** ${result.sessionId}`,
          `**Tasks:** ${sessionTasks.map((t) => t.id).join(', ')}`,
          `**Success:** true`,
          `**Duration:** ${((result.durationMs ?? 0) / 1000).toFixed(1)}s`,
          ...(result.resultado ? [`**Resultado:** ${result.resultado}`] : []),
        ].join('\n'),
        success: true,
        duration: (result.durationMs ?? 0) / 1000,
      },
      ctx.config,
    )
  }

  return result
}
