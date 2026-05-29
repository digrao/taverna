#!/usr/bin/env node
import { Command } from 'commander'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
const _req = createRequire(import.meta.url)
const { version: _version } = _req('../package.json') as { version: string }
import { defineConfig, resolveVaultPath } from './config.js'
import { scanVault, updateProjectStatus, appendLogbook } from './vault/index.js'
import { runPipeline, runSession } from './pm/executor.js'
import { snapshot } from './pm/loki.js'
import { emitEvent } from './pm/event-bus.js'
import { processInbox, MAX_CHARS_PER_RUN } from './inbox/index.js'
import { migrate } from './migrate/index.js'
import { defaultTypePolicies } from './pm/policies.js'
import { drainProject } from './pm/execute.js'
import { runScheduler } from './pm/scheduler.js'
import { loadPlugins } from './plugin/loader.js'

import type { VaultAgent } from './vault/index.js'
import type { ExecutorOptions } from './pm/executor.js'

function getVaultPath(opts: { vault?: string }): string {
  try {
    return resolveVaultPath(opts.vault)
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  }
}

const program = new Command('taverna')
  .description('Vault-first project orchestrator')
  .version(_version)

// ── run ───────────────────────────────────────────────────────────────────────

program
  .command('run [agent]')
  .description(
    'Run an agent on a project. Agent is auto-detected from project frontmatter or tipo if omitted.',
  )
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--project <id>', 'Project ID (required when agent is omitted)')
  .option('--dry-run', 'Print the prompt without executing')
  .option('--max-chars <n>', 'Max context chars', '8000')
  .option('--timeout <ms>', 'Agent timeout in ms', '600000')
  .option('--drain', 'Run tasks sequentially until done or --max-tasks is reached')
  .option('--max-tasks <n>', 'Max tasks per drain session (default: 3)', '3')
  .option('--pipeline', 'Run agents listed in project.pipeline frontmatter in sequence')
  .action(
    async (
      agentId: string | undefined,
      opts: {
        vault?: string
        project?: string
        dryRun?: boolean
        maxChars?: string
        timeout?: string
        drain?: boolean
        maxTasks?: string
        pipeline?: boolean
      },
    ) => {
      const vaultPath = getVaultPath(opts)
      const config = defineConfig({ vaultPath })
      const vault = await scanVault(config)

      const projects = opts.project
        ? vault.projects.filter((p) => p.id === opts.project || p.name === opts.project)
        : agentId
          ? vault.projects.filter((p) => {
              const name = agentId.startsWith('@') ? agentId : `@${agentId}`
              return p.agent === name
            })
          : []

      if (projects.length === 0) {
        const hint = opts.project ? `project "${opts.project}"` : `agent "${agentId}"`
        console.error(`No projects found for ${hint}`)
        process.exit(1)
      }

      const runOpts: ExecutorOptions = {
        ...(opts.maxChars ? { maxContextChars: Number(opts.maxChars) } : {}),
        ...(opts.timeout ? { timeoutMs: Number(opts.timeout) } : {}),
        vaultPath: config.vaultPath,
      }
      const maxTasks = opts.drain ? Number(opts.maxTasks ?? 3) : 1

      for (const project of projects) {
        if (opts.pipeline) {
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
            ...runOpts,
            dryRun: opts.dryRun ?? false,
          })

          for (let i = 0; i < results.length; i++) {
            const r = results[i]!
            const label = agents[i]!.id
            if (opts.dryRun) {
              console.log(`\n── ${label} prompt ──\n`)
              console.log(r.output)
            } else {
              console.log(
                `  ${label}: ${r.success ? `done (${r.durationMs}ms)` : `failed: ${r.error}`}`,
              )
              if (r.resultado) console.log(`  RESULTADO: ${r.resultado}`)
            }
          }

          const allSucceeded = results.every((r) => r.success)
          if (allSucceeded && !opts.dryRun) {
            await updateProjectStatus(project.filePath, {
              lastRun: new Date().toISOString(),
              lastStatus: 'success',
              runsTotal: project.runsTotal + 1,
            })
          }
          continue
        }

        const resolvedAgentName = agentId
          ? agentId.startsWith('@')
            ? agentId
            : `@${agentId}`
          : (project.agent ?? config.agentDefaults[project.tipo])

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
        await drainProject(agent, project, maxTasks, runOpts, config, opts.dryRun ?? false)
      }
    },
  )

// ── session ───────────────────────────────────────────────────────────────────

const sessionCmd = program
  .command('session')
  .description('Batch multiple tasks into a single agent session to maximize cache reuse')

sessionCmd
  .command('preview')
  .description('Show eligible tasks grouped by project for batched session execution')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--project <id>', 'Filter to a specific project')
  .action(async (opts: { vault?: string; project?: string }) => {
    const { isBlocked } = await import('./vault/task.js')
    const vaultPath = getVaultPath(opts)
    const config = defineConfig({ vaultPath })
    const vault = await scanVault(config)

    const projects = opts.project
      ? vault.projects.filter((p) => p.id === opts.project || p.name === opts.project)
      : vault.projects

    let found = 0
    for (const project of projects) {
      const unblocked = project.tasks
        .filter((t) => t.progresso < 100)
        .filter((t) => !isBlocked(t, project.tasks).blocked)
      if (unblocked.length === 0) continue
      found++
      const agentId = project.agent ?? config.agentDefaults[project.tipo] ?? '(none)'
      console.log(`\n${project.id}  →  ${agentId}  (${unblocked.length} task(s))`)
      for (const t of unblocked) {
        const pct = t.progresso > 0 ? ` (${t.progresso}%)` : ''
        console.log(`  · ${t.id}${pct}  ${t.title}`)
      }
    }
    if (found === 0) console.log('No projects with eligible tasks.')
    console.log()
  })

sessionCmd
  .command('run')
  .description('Run a batched session of tasks for a project')
  .requiredOption('--project <id>', 'Project ID')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--tasks <ids>', 'Comma-separated task IDs to include (default: all unblocked pending)')
  .option('--dry-run', 'Print the session prompt without executing')
  .option('--max-chars <n>', 'Max context chars', '8000')
  .option('--timeout <ms>', 'Agent timeout in ms', '600000')
  .action(
    async (opts: {
      project: string
      vault?: string
      tasks?: string
      dryRun?: boolean
      maxChars?: string
      timeout?: string
    }) => {
      const { isBlocked } = await import('./vault/task.js')
      const vaultPath = getVaultPath(opts)
      const config = defineConfig({ vaultPath })
      const vault = await scanVault(config)

      const project = vault.projects.find((p) => p.id === opts.project || p.name === opts.project)
      if (!project) {
        console.error(`Project not found: ${opts.project}`)
        process.exit(1)
      }

      const agentId = project.agent ?? config.agentDefaults[project.tipo]
      if (!agentId) {
        console.error(`No agent configured for project ${project.id}`)
        process.exit(1)
      }
      const agent = vault.agents.find(
        (a) => a.id === agentId || a.folderName === agentId || `@${a.folderName}` === agentId,
      )
      if (!agent) {
        console.error(`Agent not found: ${agentId}`)
        process.exit(1)
      }

      const allUnblocked = project.tasks
        .filter((t) => t.progresso < 100)
        .filter((t) => !isBlocked(t, project.tasks).blocked)

      const taskFilter = opts.tasks ? opts.tasks.split(',').map((s) => s.trim()) : null
      const sessionTasks = taskFilter
        ? allUnblocked.filter((t) => taskFilter.includes(t.id))
        : allUnblocked

      if (sessionTasks.length === 0) {
        console.log('No eligible tasks for session.')
        return
      }

      console.log(`\nSession: ${agent.id} on ${project.id} (${sessionTasks.length} task(s))`)
      for (const t of sessionTasks) console.log(`  · ${t.id}  ${t.title}`)
      console.log()

      const result = await runSession(
        { agent, project, tasks: sessionTasks },
        {
          maxContextChars: Number(opts.maxChars ?? 8000),
          timeoutMs: Number(opts.timeout ?? 600_000),
          vaultPath: config.vaultPath,
          dryRun: opts.dryRun ?? false,
        },
      )

      if (opts.dryRun) {
        console.log(result.output)
        return
      }

      if (result.success) {
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
          config,
        )
      }

      console.log(result.success ? `  done (${result.durationMs}ms)` : `  failed: ${result.error}`)
      if (result.resultado) console.log(`  RESULTADO: ${result.resultado}`)
    },
  )

// ── execute ───────────────────────────────────────────────────────────────────

program
  .command('execute')
  .description('Run agents on all eligible projects (one scheduler tick)')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--dry-run', 'Print prompts without executing')
  .option('--drain', 'Run tasks sequentially per project until done')
  .option('--max-tasks <n>', 'Max tasks per project (default: 3)', '3')
  .action(
    async (opts: { vault?: string; dryRun?: boolean; drain?: boolean; maxTasks?: string }) => {
      const vaultPath = getVaultPath(opts)
      const config = defineConfig({ vaultPath })
      const plugins = await loadPlugins()
      const typePolicies = defaultTypePolicies(config)
      await runScheduler(config, typePolicies, plugins, {
        ...(opts.dryRun !== undefined ? { dryRun: opts.dryRun } : {}),
        maxTicks: 1,
        maxTasksPerProject: opts.drain ? Number(opts.maxTasks ?? 3) : 1,
      })
    },
  )

// ── schedule ──────────────────────────────────────────────────────────────────

program
  .command('schedule')
  .description('Run the scheduler daemon (continuous tick loop, default: 60s)')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--dry-run', 'Print what would run without executing')
  .option('--once', 'Run a single tick and exit')
  .option('--tick-ms <n>', 'Tick interval in ms (default: 60000)')
  .option('--drain', 'Run tasks sequentially per project until done')
  .option('--max-tasks <n>', 'Max tasks per project in drain mode (default: 3)', '3')
  .action(
    async (opts: {
      vault?: string
      dryRun?: boolean
      once?: boolean
      tickMs?: string
      drain?: boolean
      maxTasks?: string
    }) => {
      const vaultPath = getVaultPath(opts)
      const config = defineConfig({ vaultPath })
      const plugins = await loadPlugins()
      const typePolicies = defaultTypePolicies(config)
      await runScheduler(config, typePolicies, plugins, {
        ...(opts.dryRun !== undefined ? { dryRun: opts.dryRun } : {}),
        ...(opts.once ? { maxTicks: 1 } : {}),
        ...(opts.tickMs ? { tickMs: Number(opts.tickMs) } : {}),
        maxTasksPerProject: opts.drain ? Number(opts.maxTasks ?? 3) : 1,
      })
    },
  )

// ── inbox ─────────────────────────────────────────────────────────────────────

program
  .command('inbox')
  .description('Process 00_Inbox: cluster ideas and move to 40_Archives/projetos-incompletos')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--dry-run', 'Print prompt without processing')
  .option('--max-chars <n>', `Max inbox chars per run (default: ${MAX_CHARS_PER_RUN})`)
  .action(async (opts: { vault?: string; dryRun?: boolean; maxChars?: string }) => {
    const vaultPath = getVaultPath(opts)
    const config = defineConfig({ vaultPath })
    const maxChars = opts.maxChars ? Number(opts.maxChars) : undefined

    const result = await processInbox(config, {
      dryRun: opts.dryRun ?? false,
      ...(maxChars !== undefined ? { maxChars } : {}),
    })

    if (result.processed === 0 && result.skipped === 0 && !opts.dryRun) {
      console.log('Inbox empty — nothing to process.')
      return
    }
    if (!opts.dryRun) {
      console.log(`  processed: ${result.processed}`)
      if (result.skipped > 0)
        console.log(`  deferred:  ${result.skipped} (over char limit, next run)`)
      for (const e of result.errors) console.error(`  error   ${e.file}: ${e.error}`)
    }
  })

// ── migrate ───────────────────────────────────────────────────────────────────

program
  .command('migrate <archive-path>')
  .description('Promote an archived project to 10_Projects using Claude Code to synthesize notes')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--id <id>', 'Override the project ID (default: folder name)')
  .option('--no-tasks', 'Skip task extraction — create only the project file')
  .option('--dry-run', 'Print the Claude prompt without running or writing anything')
  .action(
    async (
      archivePath: string,
      opts: { vault?: string; id?: string; tasks?: boolean; dryRun?: boolean },
    ) => {
      const vaultPath = getVaultPath(opts)
      const config = defineConfig({ vaultPath })
      const projectsDir = join(vaultPath, config.projectsDir)

      // Resolve archive path: absolute or relative to vault
      const resolvedArchive = archivePath.startsWith('/')
        ? archivePath
        : join(vaultPath, archivePath)

      console.log(`Scanning: ${resolvedArchive}`)

      const { result, prompt } = await migrate(resolvedArchive, projectsDir, {
        dryRun: opts.dryRun ?? false,
        ...(opts.tasks === false ? { noTasks: true } : {}),
        ...(opts.id !== undefined ? { overrideId: opts.id } : {}),
      })

      if (opts.dryRun) {
        console.log('\n── Claude prompt that would be sent ──\n')
        console.log(prompt)
        console.log('\n── Would create ──')
        console.log(`  project  ${result.projectPath}`)
        return
      }

      console.log(`  created  ${result.projectPath}`)
      for (const t of result.tasksCreated) {
        console.log(`  task     ${t.replace(vaultPath + '/', '')}`)
      }
      console.log(`\nDone. ${result.tasksCreated.length} task(s) created.`)
    },
  )

// ── policy ────────────────────────────────────────────────────────────────────

program
  .command('policy [project-id]')
  .description('Show effective scheduling policy for a project (or all projects)')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--tipo <tipo>', 'Filter by project type: USP, BB, *')
  .action(async (projectId: string | undefined, opts: { vault?: string; tipo?: string }) => {
    const { readProjectPolicy, mergePolicy, getTypePolicy } = await import('./pm/policies.js')
    const { computeHealth } = await import('./pm/loki.js')
    const { resolvePolicy } = await import('./pm/policy-resolver.js')

    const FREQ_LABEL: Record<string, string> = {
      hourly: '1h',
      daily: '24h',
      weekly: '7d',
      monthly: '30d',
      never: 'never',
    }
    const FREQ_MS: Record<string, number> = {
      hourly: 3_600_000,
      daily: 86_400_000,
      weekly: 604_800_000,
      monthly: 2_592_000_000,
    }

    function fmtNextRun(project: import('./vault/types.js').VaultProject): string {
      if (project.runEvery === 'never') return 'nunca'
      const freq = FREQ_MS[project.runEvery]
      if (!freq) return '?'
      const lastMs = project.lastRun ? new Date(project.lastRun).getTime() : 0
      const nextMs = lastMs + freq
      const diffS = Math.round((nextMs - Date.now()) / 1000)
      if (diffS <= 0) return 'agora (overdue)'
      const h = Math.floor(diffS / 3600)
      if (h < 1) return `em ${Math.floor(diffS / 60)}min`
      if (h < 24) return `em ${h}h`
      return `em ${Math.floor(h / 24)}d`
    }

    const vaultPath = getVaultPath(opts)
    const config = defineConfig({ vaultPath })
    const vault = await scanVault(config)
    const typePolicies = defaultTypePolicies(config)

    const projects = projectId
      ? vault.projects.filter((p) => p.id === projectId || p.name === projectId)
      : opts.tipo
        ? vault.projects.filter((p) => p.tipo === opts.tipo)
        : vault.projects

    if (projects.length === 0) {
      console.error(`No projects found${projectId ? ` for "${projectId}"` : ''}`)
      process.exit(1)
    }

    const hr = '─'.repeat(52)

    for (const project of projects) {
      const typeSteps = getTypePolicy(project.tipo, typePolicies)
      const projectPolicy = readProjectPolicy(project.raw)
      const effectiveSteps = mergePolicy(typeSteps, projectPolicy)
      const snap = computeHealth(project)

      const composeMode = projectPolicy?.compose ?? 'inherit (default)'
      const hasOverride = projectPolicy !== undefined

      console.log(`\n${hr}`)
      console.log(
        `${project.id}  ·  tipo: ${project.tipo}  ·  priority: ${project.priority}  ·  runEvery: ${project.runEvery} (${FREQ_LABEL[project.runEvery] ?? '?'})`,
      )
      console.log(hr)

      console.log(`\nType policy (${project.tipo}):`)
      if (typeSteps.length === 0) {
        console.log('  (none)')
      } else {
        typeSteps.forEach((s, i) => {
          const at = s.at ? `  at ${s.at}` : '  (any time)'
          console.log(`  ${i + 1}  ${s.agent}${at}`)
        })
      }

      console.log(
        `\nProject overrides:  ${hasOverride ? `compose=${projectPolicy!.compose}` : 'none'}`,
      )
      if (hasOverride && projectPolicy!.steps.length > 0) {
        projectPolicy!.steps.forEach((s, i) => {
          const at = s.at ? `  at ${s.at}` : '  (any time)'
          console.log(`  ${i + 1}  ${s.agent}${at}`)
        })
      }

      console.log(`\nEffective steps:  (compose: ${composeMode})`)
      if (effectiveSteps.length === 0) {
        console.log('  (none — project will not run)')
      } else {
        effectiveSteps.forEach((s, i) => {
          const at = s.at ? `  at ${s.at}` : '  (any time, governed by runEvery)'
          console.log(`  ${i + 1}  ${s.agent}${at}`)
        })
      }

      console.log(`\nSchedule:`)
      console.log(
        `  Last run:    ${project.lastRun ? new Date(project.lastRun).toLocaleString('pt-BR') : 'never'} (${project.lastStatus ?? '—'})`,
      )
      console.log(`  Runs total:  ${project.runsTotal}`)
      console.log(`  Next run:    ${fmtNextRun(project)}`)

      console.log(`\nHealth:`)
      console.log(
        `  Tasks:       ${snap.tasks_done}/${snap.tasks_total} done  (progresso: ${snap.progresso}%)`,
      )
      if (snap.deadline_days !== undefined) {
        const dLabel =
          snap.deadline_days < 0
            ? `${Math.abs(snap.deadline_days)}d atrás`
            : snap.deadline_days === 0
              ? 'hoje'
              : `${snap.deadline_days}d`
        console.log(`  Deadline:    ${dLabel}`)
      }
      console.log(`  Status:      ${snap.health}`)

      const agentId = project.agent ?? effectiveSteps[0]?.agent
      const agent = agentId
        ? vault.agents.find(
            (a) => a.id === agentId || `@${a.folderName}` === agentId || a.folderName === agentId,
          )
        : undefined
      if (agent) {
        const perm = resolvePolicy(agent, project)
        console.log(`\nPermissions:  (agent: ${agent.id}  mode: ${perm.permissionMode})`)
        if (perm.permissionMode === 'bypassPermissions') {
          console.log(`  bypass — all tools allowed (add permissions: [] to directive to restrict)`)
        } else {
          if (perm.agentTools.length > 0) {
            console.log(`  agent directive:  ${perm.agentTools.join(', ')}`)
          }
          if (perm.inferredTools.length > 0) {
            console.log(
              `  inferred (${perm.inferredFrom ?? 'target'}):  ${perm.inferredTools.join(', ')}`,
            )
          }
          if (perm.allowedTools && perm.allowedTools.length > 0) {
            console.log(`  effective:        ${perm.allowedTools.join(', ')}`)
          } else {
            console.log(`  effective:        (none — agent will be blocked from all tools)`)
          }
        }
      }
    }
    console.log(`\n${hr}`)
  })

// ── status ────────────────────────────────────────────────────────────────────

program
  .command('status')
  .description('Show task dependency status for a project')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--project <id>', 'Project ID (required)')
  .action(async (opts: { vault?: string; project?: string }) => {
    const { isBlocked, hasCycle, resolveDependency } = await import('./vault/task.js')

    if (!opts.project) {
      console.error('Error: --project <id> is required')
      process.exit(1)
    }

    const vaultPath = getVaultPath(opts)
    const config = defineConfig({ vaultPath })
    const vault = await scanVault(config)

    const project = vault.projects.find((p) => p.id === opts.project || p.name === opts.project)
    if (!project) {
      console.error(`Project not found: ${opts.project}`)
      process.exit(1)
    }

    const tasks = project.tasks
    const cycle = hasCycle(tasks)
    if (cycle) {
      console.error('  warn: circular dependency detected')
    }

    for (const task of tasks) {
      const pct = String(task.progresso).padStart(3, ' ')
      const { blocked, blockedBy: _blockedBy } = isBlocked(task, tasks)

      if (!blocked) {
        console.log(`${task.filePath.replace(vaultPath + '/', '')}  [${pct}%] ✓`)
      } else {
        const depList = (task.depends ?? [])
          .map((depId) => {
            const dep = resolveDependency(depId, tasks)
            const ok = dep === undefined || dep.progresso === 100
            return `${depId} ${ok ? '✓' : '✗'}`
          })
          .join(', ')
        console.log(
          `${task.filePath.replace(vaultPath + '/', '')}  [${pct}%] BLOCKED por: ${depList}`,
        )
      }
    }
  })

// ── snapshot ──────────────────────────────────────────────────────────────────

program
  .command('snapshot')
  .description(
    'Emit project_snapshot events for all projects (health + priority) without running agents',
  )
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--tipo <tipo>', 'Filter by project type: USP, BB, *')
  .option('--dry-run', 'Print JSON to stdout without journal emission')
  .action(async (opts: { vault?: string; tipo?: string; dryRun?: boolean }) => {
    const vaultPath = getVaultPath(opts)
    const config = defineConfig({ vaultPath })
    const vault = await scanVault(config)

    const projects = opts.tipo ? vault.projects.filter((p) => p.tipo === opts.tipo) : vault.projects

    for (const project of projects) {
      const payload = (await import('./pm/loki.js')).computeHealth(project)
      if (opts.dryRun) {
        console.log(JSON.stringify(payload, null, 2))
      } else {
        snapshot(project)
        console.log(
          `  ${project.id.padEnd(28)} health=${payload.health} progresso=${payload.progresso}%`,
        )
      }
    }
  })

// ── archive-task ──────────────────────────────────────────────────────────────

program
  .command('archive-task <project> <task-id>')
  .description('Mark a task as done (progresso: 100) and move it to tasks/archive/')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .action(async (projectId: string, taskId: string, opts: { vault?: string }) => {
    const vaultPath = getVaultPath(opts)
    const config = defineConfig({ vaultPath })
    const { join: pjoin } = await import('node:path')
    const { rename, readFile, writeFile, mkdir } = await import('node:fs/promises')
    // existsSync not needed here
    const matter = (await import('gray-matter')).default

    const projectsDir = pjoin(vaultPath, config.projectsDir)
    // Support partial match: "07" matches "07-token-usage-logging"
    const { readdir } = await import('node:fs/promises')
    const entries = await readdir(pjoin(projectsDir, projectId, 'tasks')).catch(
      () => [] as string[],
    )
    const match = entries.find(
      (f) => f.startsWith(taskId) && f.endsWith('.md') && !f.includes('archive'),
    )

    if (!match) {
      console.error(`Task not found: ${taskId} in ${projectId}/tasks/`)
      process.exit(1)
    }

    const taskPath = pjoin(projectsDir, projectId, 'tasks', match)
    const archiveDir = pjoin(projectsDir, projectId, 'tasks', 'archive')
    const archivePath = pjoin(archiveDir, match)

    const raw = await readFile(taskPath, 'utf8')
    const parsed = matter(raw)
    parsed.data['progresso'] = 100
    await mkdir(archiveDir, { recursive: true })
    await writeFile(taskPath, matter.stringify(parsed.content, parsed.data), 'utf8')
    await rename(taskPath, archivePath)

    console.log(`  archived  ${projectId}/tasks/${match}`)
  })

// ── report ────────────────────────────────────────────────────────────────────

program
  .command('report')
  .description('Summarise last 24h of agent runs → 60_Agents/5_Inbox/YYYYMMdd-report.md')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--hours <n>', 'Lookback window in hours (default: 24)', '24')
  .option('--dry-run', 'Print to stdout without writing')
  .action(async (opts: { vault?: string; hours?: string; dryRun?: boolean }) => {
    const { writeFile } = await import('node:fs/promises')
    const vaultPath = getVaultPath(opts)
    const config = defineConfig({ vaultPath })
    const hours = Number(opts.hours ?? 24)
    const cutoff = new Date(Date.now() - hours * 3_600_000)

    const state = await scanVault(config)
    const pad = (n: number) => String(n).padStart(2, '0')
    const today = new Date()
    const dateStr = `${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`

    interface RunEntry {
      agent: string
      project: string
      success: boolean | undefined
      duration: number | undefined
      ts: string
    }
    const runs: RunEntry[] = []

    for (const agent of state.agents) {
      const entries = await (await import('./vault/logbook.js')).readLogbook(agent.id, config)
      for (const e of entries) {
        if (new Date(e.timestamp) >= cutoff) {
          runs.push({
            agent: agent.id,
            project: e.projectName,
            success: e.success,
            duration: e.duration,
            ts: e.timestamp,
          })
        }
      }
    }

    runs.sort((a, b) => a.ts.localeCompare(b.ts))

    const successes = runs.filter((r) => r.success === true).length
    const failures = runs.filter((r) => r.success === false).length
    const avgDur =
      runs.filter((r) => r.duration).reduce((s, r) => s + (r.duration ?? 0), 0) /
      (runs.filter((r) => r.duration).length || 1)

    const lines = [
      `# Report — ${dateStr} (últimas ${hours}h)`,
      '',
      `**Runs:** ${runs.length}  ·  **Sucesso:** ${successes}  ·  **Falhas:** ${failures}  ·  **Duração média:** ${avgDur.toFixed(1)}s`,
      '',
    ]

    if (failures > 0) {
      lines.push('## Falhas')
      for (const r of runs.filter((r) => r.success === false)) {
        lines.push(`- ✗ **${r.project}** via ${r.agent} @ ${r.ts.slice(11, 16)}`)
      }
      lines.push('')
    }

    lines.push('## Execuções')
    for (const r of runs) {
      const icon = r.success === true ? '✓' : r.success === false ? '✗' : '·'
      const dur = r.duration ? ` (${r.duration.toFixed(1)}s)` : ''
      lines.push(`- ${icon} **${r.project}** via ${r.agent}${dur} @ ${r.ts.slice(11, 16)}`)
    }

    if (runs.length === 0) lines.push('_Nenhuma execução registrada no período._')

    const markdown = lines.join('\n') + '\n'

    if (opts.dryRun) {
      process.stdout.write(markdown)
    } else {
      const _outPath = join(
        vaultPath,
        config.logbooksDir,
        '..',
        '5_Inbox',
        `${dateStr}-report.md`,
      ).replace(/\/\.\.\//g, '/')
      const resolvedPath = join(vaultPath, '60_Agents', '5_Inbox', `${dateStr}-report.md`)
      await writeFile(resolvedPath, markdown, 'utf8')
      console.log(`  written  60_Agents/5_Inbox/${dateStr}-report.md  (${runs.length} runs)`)
    }
  })

// ── backlinks ─────────────────────────────────────────────────────────────────

program
  .command('backlinks <note>')
  .description('Find all vault files linking to a note (wikilinks + markdown links)')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .action(async (note: string, opts: { vault?: string }) => {
    const { findBacklinks } = await import('./vault/backlinks.js')
    const vaultPath = getVaultPath(opts)
    const notePath = note.startsWith('/') ? note : join(vaultPath, note)
    const results = await findBacklinks(vaultPath, notePath)

    if (results.length === 0) {
      console.log(`No backlinks found for "${note}"`)
      return
    }
    console.log(`${results.length} backlink(s) → ${note}`)
    for (const r of results) console.log(`  ${r.sourceRelative}`)
  })

// ── plan ─────────────────────────────────────────────────────────────────────

program
  .command('plan')
  .description('Aggregate pending tasks across all projects and write STATUS.md to vault root')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--dry-run', 'Print to stdout without writing')
  .action(async (opts: { vault?: string; dryRun?: boolean }) => {
    const { writeFile } = await import('node:fs/promises')
    const { computeHealth } = await import('./pm/loki.js')

    const vaultPath = getVaultPath(opts)
    const config = defineConfig({ vaultPath })
    const vault = await scanVault(config)

    const PRIO_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }
    const sorted = [...vault.projects].sort(
      (a, b) => (PRIO_ORDER[a.priority] ?? 1) - (PRIO_ORDER[b.priority] ?? 1),
    )

    const now = new Date()
    const dateStr = now.toISOString().split('T')[0]
    const lines: string[] = [
      `# STATUS — ${dateStr}`,
      '',
      `_${vault.projects.length} projetos · gerado por \`taverna plan\`_`,
      '',
    ]

    for (const project of sorted) {
      const snap = computeHealth(project)
      const pending = project.tasks.filter((t) => t.progresso < 100)
      const HEALTH_ICON: Record<string, string> = {
        ok: '🟢',
        'at-risk': '🟡',
        overdue: '🔴',
        idle: '⚪',
      }
      const icon = HEALTH_ICON[snap.health] ?? '⚪'
      const prio =
        project.priority === 'high' ? '[HIGH]' : project.priority === 'medium' ? '[MED]' : '[LOW]'
      lines.push(`## ${icon} ${prio} ${project.id} (${project.tipo})`)

      if (snap.deadline_days !== undefined) {
        const dl =
          snap.deadline_days < 0
            ? `${Math.abs(snap.deadline_days)}d atrasado`
            : `${snap.deadline_days}d`
        lines.push(`_deadline: ${dl} · progresso: ${snap.progresso}%_`)
      } else if (snap.progresso > 0) {
        lines.push(`_progresso: ${snap.progresso}%_`)
      }

      if (pending.length === 0) {
        lines.push('_sem tasks pendentes_')
      } else {
        for (const t of pending.slice(0, 5)) {
          const pct = t.progresso > 0 ? ` (${t.progresso}%)` : ''
          const blocked = t.bloqueio ? ` ⚠ ${t.bloqueio}` : ''
          const waiting = t.requerHumano?.length ? ` 👤 aguardando humano` : ''
          lines.push(`- [ ] ${t.title}${pct}${blocked}${waiting}`)
        }
        if (pending.length > 5) lines.push(`- _…mais ${pending.length - 5} task(s)_`)
      }
      lines.push('')
    }

    const markdown = lines.join('\n')

    if (opts.dryRun) {
      process.stdout.write(markdown + '\n')
    } else {
      await writeFile(join(vaultPath, 'STATUS.md'), markdown, 'utf8')
      console.log(`  written  STATUS.md  (${vault.projects.length} projects)`)
    }
  })

// ── insights ──────────────────────────────────────────────────────────────────

program
  .command('insights')
  .description('Emit a vault_snapshot event with inbox/zettelkasten/projects counts')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .action(async (opts: { vault?: string }) => {
    const { readdir } = await import('node:fs/promises')
    const vaultPath = getVaultPath(opts)

    const [inboxEntries, zettelEntries, projectEntries] = await Promise.all([
      readdir(join(vaultPath, '00_Inbox'), { withFileTypes: true }),
      readdir(join(vaultPath, '00_Zettelkasten'), { withFileTypes: true }),
      readdir(join(vaultPath, '10_Projects'), { withFileTypes: true }),
    ])

    emitEvent({
      event: 'vault_snapshot',
      inbox: inboxEntries.filter((e) => e.isFile()).length,
      zettelkasten: zettelEntries.filter((e) => e.isFile()).length,
      projects: projectEntries.filter((e) => e.isDirectory()).length,
    })
  })

// ── serve ─────────────────────────────────────────────────────────────────────

program
  .command('serve')
  .description('Start HTTP status server (default port: 2948)')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--port <n>', 'Port to listen on', '2948')
  .action(async (opts: { vault?: string; port?: string }) => {
    const { createServer } = await import('./server/index.js')
    const vaultPath = getVaultPath(opts)
    const config = defineConfig({ vaultPath })
    await createServer(config, { port: Number(opts.port ?? 2948) })
  })

// ── mcp ───────────────────────────────────────────────────────────────────────

program
  .command('mcp')
  .description('Start MCP server (stdio) — wraps the HTTP API at :2948')
  .option(
    '--api-url <url>',
    'Taverna HTTP API base URL (or TAVERNA_API_URL env var)',
    'http://localhost:2948',
  )
  .action(async (opts: { apiUrl?: string }) => {
    if (opts.apiUrl) process.env['TAVERNA_API_URL'] = opts.apiUrl
    await import('./mcp/server.js')
  })

// ── create-plugin ─────────────────────────────────────────────────────────────

program
  .command('create-plugin <name>')
  .description('Scaffold a new taverna plugin in ~/tools/taverna-<name>/')
  .option(
    '--dir <path>',
    'Parent directory for the new plugin',
    join(dirname(_req.resolve('../package.json')), '..'),
  )
  .option('--with-cli', 'Also scaffold a src/cli.ts entry point')
  .action(async (name: string, opts: { dir: string; withCli?: boolean }) => {
    const { scaffoldPlugin } = await import('./plugin/scaffold.js')
    try {
      const { pluginDir, files } = await scaffoldPlugin({
        name,
        targetDir: opts.dir,
        withCli: opts.withCli,
      })
      console.log(`created ${pluginDir}`)
      for (const f of files) console.log(`  ${f}`)
      console.log(`\nnext steps:`)
      console.log(`  cd ${pluginDir}`)
      console.log(`  npm install`)
      console.log(`  npm run build`)
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e))
      process.exit(1)
    }
  })

program.parse()
