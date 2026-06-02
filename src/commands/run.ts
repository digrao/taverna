import { z } from 'zod'
import { spawn } from 'node:child_process'
import type { CommandDef, TavernaContext } from './types.js'
import { scanVault, updateProjectStatus } from '../vault/index.js'
import { runAgent, runPipeline } from '../pm/engine/index.js'
import { drainProject } from '../pm/engine/index.js'
import { snapshot } from '../pm/observability/index.js'
import type { ExecutorOptions } from '../pm/engine/index.js'
import type { VaultAgent } from '../vault/types.js'

function spawnTaverna(args: string[]): void {
  const proc = spawn('taverna', args, {
    stdio: 'ignore',
    detached: true,
    env: { ...process.env },
  })
  proc.unref()
}

export const runCommands: CommandDef[] = [
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
]

export interface RunParams {
  agentId?: string
  projectId?: string
  drain?: boolean
  maxTasks?: number
  pipeline?: boolean
  maxChars?: number
  timeout?: number
}

/** Execute run directly — used by CLI `run` command. Prints progress to stdout. */
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
