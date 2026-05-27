/**
 * Command definitions — all taverna operations centralized here.
 *
 * Each command:
 *   - Pure handler function (no CLI formatting)
 *   - Takes args + context, returns CommandResult
 *   - Can be called from CLI, HTTP, or MCP
 */

import { CommandRegistry, type CommandHandler } from './command-handler.js'
import type { VaultProject } from '../vault/index.js'
import { type TavernaConfig } from '../config.js'
import { scanVault, appendLogbook, updateProjectStatus } from '../vault/index.js'
import { runAgent } from '../pm/executor.js'
import { snapshot, computeHealth } from '../pm/loki.js'
import { isBlocked } from '../vault/task.js'

// ──────────────────────────────────────────────────────────────────────────────

/** taverna run [agent] --project <id> */
const cmdRun: CommandHandler<
  {
    agent?: string
    project?: string
    dryRun?: boolean
    maxChars?: number
    timeout?: number
    drain?: boolean
    maxTasks?: number
    pipeline?: boolean
  },
  {
    projectsRun: number
    projectsFailed: number
    tasksCompleted?: number
  }
> = async (args, ctx) => {
  const vault = await scanVault(ctx.config)

  let projectsRun = 0
  let projectsFailed = 0

  // Filter projects
  const projects = args.project
    ? vault.projects.filter((p) => p.id === args.project || p.name === args.project)
    : args.agent
      ? vault.projects.filter((p) => {
          const name = args.agent!.startsWith('@') ? args.agent : `@${args.agent}`
          return p.agent === name
        })
      : []

  if (projects.length === 0) {
    return {
      success: false,
      error: `No projects found for ${args.project ? `project "${args.project}"` : `agent "${args.agent}"`}`,
    }
  }

  for (const project of projects) {
    const result = await runOnce(
      vault,
      project,
      {
        ...(args.maxChars !== undefined ? { maxContextChars: args.maxChars } : {}),
        ...(args.timeout !== undefined ? { timeoutMs: args.timeout } : {}),
      },
      ctx.config,
      args.dryRun ?? false,
    )
    if (result) projectsRun++
    else projectsFailed++
  }

  return {
    success: projectsRun > 0 && projectsFailed === 0,
    data: { projectsRun, projectsFailed },
  }
}

async function runOnce(
  vault: Awaited<ReturnType<typeof scanVault>>,
  project: VaultProject,
  execOpts: { maxContextChars?: number; timeoutMs?: number },
  config: TavernaConfig,
  dryRun: boolean,
): Promise<boolean> {
  const resolvedAgent = project.agent
    ? vault.agents.find((a) => a.id === project.agent || a.folderName === project.agent)
    : null

  if (!resolvedAgent) {
    return false
  }

  const result = await runAgent(resolvedAgent, project, {
    ...execOpts,
    vaultPath: config.vaultPath,
  })

  if (dryRun) {
    return true
  }

  if (result.success) {
    await updateProjectStatus(project.filePath, {
      lastRun: new Date().toISOString(),
      lastStatus: 'success',
      runsTotal: project.runsTotal + 1,
    })
    await appendLogbook(
      resolvedAgent.id,
      {
        projectName: project.id,
        content: [
          `**Success:** true`,
          `**Duration:** ${(result.durationMs / 1000).toFixed(1)}s`,
          ...(result.resultado ? [`**Resultado:** ${result.resultado}`] : []),
        ].join('\n'),
        success: true,
        duration: result.durationMs / 1000,
      },
      config,
    )
  }

  snapshot(project)
  return result.success
}

// ──────────────────────────────────────────────────────────────────────────────

/** taverna state — show all projects with health and costs */
const cmdState: CommandHandler<
  { tipo?: string },
  { projects: Array<{ id: string; health: string; progresso: number }> }
> = async (args, ctx) => {
  const vault = await scanVault(ctx.config)

  const projects = (args.tipo ? vault.projects.filter((p) => p.tipo === args.tipo) : vault.projects)
    .map((p) => {
      const health = computeHealth(p)
      return {
        id: p.id,
        health: health.health,
        progresso: health.progresso,
        tasks_total: health.tasks_total,
        tasks_done: health.tasks_done,
      }
    })
    .sort((a, b) => a.id.localeCompare(b.id))

  return {
    success: true,
    data: { projects },
  }
}

// ──────────────────────────────────────────────────────────────────────────────

/** taverna session preview — show eligible tasks */
const cmdSessionPreview: CommandHandler<
  { projectId?: string },
  {
    groups: Array<{
      projectId: string
      agent: string
      tasks: Array<{ id: string; title: string; progresso: number }>
    }>
  }
> = async (args, ctx) => {
  const vault = await scanVault(ctx.config)

  const projects = args.projectId
    ? vault.projects.filter((p) => p.id === args.projectId)
    : vault.projects

  const groups = []
  for (const project of projects) {
    const unblocked = project.tasks
      .filter((t) => t.progresso < 100)
      .filter((t) => !isBlocked(t, project.tasks).blocked)

    if (unblocked.length === 0) continue

    const agentId = project.agent ?? ctx.config.agentDefaults[project.tipo] ?? '(none)'
    groups.push({
      projectId: project.id,
      agent: agentId,
      tasks: unblocked.map((t) => ({
        id: t.id,
        title: t.title,
        progresso: t.progresso,
      })),
    })
  }

  return {
    success: true,
    data: { groups },
  }
}

// ──────────────────────────────────────────────────────────────────────────────

/** Initialize all command definitions */
export function createCommandRegistry(): CommandRegistry {
  const registry = new CommandRegistry()

  registry.register({
    id: 'run',
    description: 'Run an agent on a project',
    handler: cmdRun,
  })

  registry.register({
    id: 'state',
    description: 'Show all projects with health and costs',
    handler: cmdState,
  })

  registry.register({
    id: 'session-preview',
    description: 'Show eligible tasks for batched session execution',
    handler: cmdSessionPreview,
  })

  // Add more commands here...

  return registry
}
