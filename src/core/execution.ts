import { z } from 'zod'
import { spawn } from 'node:child_process'
import { scanVault, appendLogbook, updateProjectStatus } from '../vault/index.js'
import {
  runAgent,
  runPipeline,
  drainProject,
  runSession,
  runScheduler,
} from '../manager/engine/index.js'
import { snapshot } from '../manager/observability/index.js'
import { isBlocked } from '../vault/task.js'
import { defaultTypePolicies } from '../manager/scheduling/index.js'
import { loadPlugins } from '../plugin/loader.js'
import type { TavernaContext, CommandDef } from './types.js'
import type { ExecutorOptions } from '../manager/engine/index.js'
import type { AgentResult } from '../manager/engine/index.js'
import type { VaultAgent, VaultTask } from '../vault/types.js'
import type { SchedulingPlugins } from '../manager/scheduling/plugins.js'

// ── Background spawn ───────────────────────────────────────────────────────────

function spawnTaverna(args: string[]): void {
  const proc = spawn('taverna', args, {
    stdio: 'ignore',
    detached: true,
    env: { ...process.env },
  })
  proc.unref()
}

// ── Direct execution (used by CLI and internal calls) ──────────────────────────

export interface RunParams {
  agentId?: string
  projectId?: string
  drain?: boolean
  maxTasks?: number
  pipeline?: boolean
  maxChars?: number
  timeout?: number
}

export async function executeRun(params: RunParams, ctx: TavernaContext): Promise<void> {
  const vault = await scanVault(ctx.config)

  const projects = params.projectId
    ? vault.projects.filter((p) => p.id === params.projectId || p.name === params.projectId)
    : params.agentId
      ? vault.projects.filter((p) => {
          const name = params.agentId!.startsWith('@') ? params.agentId! : `@${params.agentId}`
          return p.agent === name
        })
      : []

  if (projects.length === 0) {
    const hint = params.projectId ? `project "${params.projectId}"` : `agent "${params.agentId}"`
    throw new Error(`No projects found for ${hint}`)
  }

  const execOpts: ExecutorOptions = {
    ...(params.maxChars ? { maxContextChars: params.maxChars } : {}),
    ...(params.timeout ? { timeoutMs: params.timeout } : {}),
    vaultPath: ctx.vaultPath,
  }
  const maxTasks = params.drain ? (params.maxTasks ?? 3) : 1

  for (const project of projects) {
    if (params.pipeline) {
      const pipelineIds = project.pipeline
      if (!pipelineIds || pipelineIds.length === 0) {
        console.error(`  skip ${project.id}: no pipeline declared in frontmatter`)
        continue
      }

      const agents: VaultAgent[] = []
      for (const id of pipelineIds) {
        const agent = vault.agents.find(
          (a) => a.id === id || a.folderName === id || `@${a.folderName}` === id,
        )
        if (!agent) {
          console.error(`  abort ${project.id}: pipeline agent ${id} not found`)
          break
        }
        agents.push(agent)
      }
      if (agents.length !== pipelineIds.length) continue

      console.log(`\nPipeline on ${project.id}: ${agents.map((a) => a.id).join(' → ')}`)
      const results = await runPipeline(agents, project, {
        ...execOpts,
        dryRun: ctx.dryRun ?? false,
      })

      for (let i = 0; i < results.length; i++) {
        const r = results[i]!
        const label = agents[i]!.id
        if (ctx.dryRun) {
          console.log(`\n── ${label} prompt ──\n`)
          console.log(r.output)
        } else {
          console.log(
            `  ${label}: ${r.success ? `done (${r.durationMs}ms)` : `failed: ${r.error}`}`,
          )
          if (r.resultado) console.log(`  RESULTADO: ${r.resultado}`)
        }
      }

      if (results.every((r) => r.success) && !ctx.dryRun) {
        await updateProjectStatus(project.filePath, {
          lastRun: new Date().toISOString(),
          lastStatus: 'success',
          runsTotal: project.runsTotal + 1,
        })
      }
      continue
    }

    const resolvedAgentName = params.agentId
      ? params.agentId.startsWith('@')
        ? params.agentId
        : `@${params.agentId}`
      : (project.agent ?? ctx.config.agentDefaults[project.tipo])

    if (!resolvedAgentName) {
      console.error(
        `  skip ${project.id}: no agent declared and no default for tipo "${project.tipo}"`,
      )
      continue
    }

    const agent = vault.agents.find(
      (a) => a.id === resolvedAgentName || a.folderName === resolvedAgentName,
    )
    if (!agent) {
      console.error(
        `  skip ${project.id}: agent ${resolvedAgentName} not found (available: ${vault.agents.map((a) => a.id).join(', ')})`,
      )
      continue
    }

    console.log(
      `\nRunning ${agent.id} on ${project.id}${maxTasks > 1 ? ` (drain ≤${maxTasks} tasks)` : ''}…`,
    )

    if (ctx.dryRun) {
      const result = await runAgent(agent, project, { ...execOpts, dryRun: true })
      console.log(result.output)
    } else {
      await drainProject(agent, project, maxTasks, execOpts, ctx.config, false)
    }

    snapshot(project)
  }
}

export async function executeSessionRun(
  params: { projectId: string; taskIds?: string[]; maxChars?: number; timeout?: number },
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

// ── HTTP fire-and-forget endpoints (spawn taverna in background) ───────────────

export async function dryRunSession(params: Record<string, unknown>, ctx: TavernaContext) {
  const { runSession: execSession } = await import('../manager/engine/executor.js')
  const { planSession: plan } = await import('../manager/scheduling/session-planner.js')
  const state = await (ctx.scan ? ctx.scan() : scanVault(ctx.config))

  const id = String(params['id'])
  const project = state.projects.find((p) => p.id === id || p.name === id)
  if (!project) throw new Error(`project "${id}" not found`)

  const agentId = project.agent ?? ctx.config.agentDefaults[project.tipo]
  if (!agentId) throw new Error(`no agent configured for project ${id}`)

  const agent = state.agents.find(
    (a) => a.id === agentId || a.folderName === agentId || `@${a.folderName}` === agentId,
  )
  if (!agent) throw new Error(`agent not found: ${agentId}`)

  const sessionPlan = plan(project)
  if (sessionPlan.runnable.length === 0) throw new Error('no eligible tasks')

  const result = await execSession(
    { agent, project, tasks: sessionPlan.runnable },
    { dryRun: true, vaultPath: ctx.vaultPath },
  )

  return {
    project: id,
    agent: agent.id,
    char_total: result.output.length,
    task_count: sessionPlan.runnable.length,
    prompt: result.output,
  }
}

export const executionCommands: CommandDef[] = [
  {
    id: 'run',
    description: 'Trigger taverna work — runs agents on all eligible projects',
    params: {},
    http: { method: 'POST', path: '/api/run' },
    handler: async () => {
      spawnTaverna(['work'])
      return { started: true, message: 'taverna work iniciado' }
    },
  },
  {
    id: 'drain',
    description: 'Trigger taverna work --drain — drains task queues in all eligible projects',
    params: {},
    http: { method: 'POST', path: '/api/drain' },
    handler: async () => {
      spawnTaverna(['work', '--drain'])
      return { started: true, message: 'taverna work --drain iniciado' }
    },
  },
  {
    id: 'run_project',
    description: 'Run an agent on a specific project immediately',
    params: { id: z.string().describe('Project ID') },
    http: { method: 'POST', path: '/api/run/:id' },
    handler: async ({ id }) => {
      spawnTaverna(['run', '--project', String(id)])
      return { started: true, message: `taverna run --project ${String(id)} iniciado` }
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
        .describe('Comma-separated task IDs (default: all unblocked pending)'),
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
