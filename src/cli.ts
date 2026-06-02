#!/usr/bin/env node
import { Command } from 'commander'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
const _req = createRequire(import.meta.url)
const { version: _version } = _req('../package.json') as { version: string }
import { defineConfig, resolveVaultPath } from './config.js'
import {
  executeRun,
  executeSessionRun,
  generateReport,
  generatePlan,
  showPolicy,
  showTaskStatus,
  archiveTask,
  emitInsights,
  runWork,
} from './commands/index.js'
import { migrate } from './migrate/index.js'
import type { TavernaContext } from './commands/types.js'

function getVaultPath(opts: { vault?: string }): string {
  try {
    return resolveVaultPath(opts.vault)
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  }
}

function buildContext(opts: { vault?: string; dryRun?: boolean }): TavernaContext {
  const vaultPath = getVaultPath(opts)
  const config = defineConfig({ vaultPath })
  return {
    config,
    vaultPath,
    ...(opts.dryRun !== undefined ? { dryRun: opts.dryRun } : {}),
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
      const ctx = buildContext(opts)
      try {
        await executeRun(
          {
            ...(agentId !== undefined ? { agentId } : {}),
            ...(opts.project !== undefined ? { projectId: opts.project } : {}),
            ...(opts.drain !== undefined ? { drain: opts.drain } : {}),
            maxTasks: Number(opts.maxTasks ?? 3),
            ...(opts.pipeline !== undefined ? { pipeline: opts.pipeline } : {}),
            ...(opts.maxChars ? { maxChars: Number(opts.maxChars) } : {}),
            ...(opts.timeout ? { timeout: Number(opts.timeout) } : {}),
          },
          ctx,
        )
      } catch (e) {
        console.error(e instanceof Error ? e.message : String(e))
        process.exit(1)
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
    const ctx = buildContext(opts)
    const { scanVault } = await import('./vault/index.js')
    const vault = await scanVault(ctx.config)

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
      const agentId = project.agent ?? ctx.config.agentDefaults[project.tipo] ?? '(none)'
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
      const ctx = buildContext(opts)
      try {
        const result = await executeSessionRun(
          {
            projectId: opts.project,
            ...(opts.tasks ? { taskIds: opts.tasks.split(',').map((s) => s.trim()) } : {}),
            maxChars: Number(opts.maxChars ?? 8000),
            timeout: Number(opts.timeout ?? 600_000),
          },
          ctx,
        )

        if (ctx.dryRun) {
          console.log(result.output)
          return
        }
        console.log(
          result.success ? `  done (${result.durationMs}ms)` : `  failed: ${result.error}`,
        )
        if (result.resultado) console.log(`  RESULTADO: ${result.resultado}`)
      } catch (e) {
        console.error(e instanceof Error ? e.message : String(e))
        process.exit(1)
      }
    },
  )

// ── work ─────────────────────────────────────────────────────────────────────

program
  .command('work')
  .description('Dispatch agents on all eligible projects and exit (one-shot)')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--dry-run', 'Print what would run without executing')
  .option('--drain', 'Run tasks sequentially per project until done')
  .option('--max-tasks <n>', 'Max tasks per project (default: 3)', '3')
  .action(
    async (opts: { vault?: string; dryRun?: boolean; drain?: boolean; maxTasks?: string }) => {
      const ctx = buildContext(opts)
      await runWork(
        {
          ...(opts.drain !== undefined ? { drain: opts.drain } : {}),
          maxTasks: Number(opts.maxTasks ?? 3),
        },
        ctx,
      )
    },
  )

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
      const ctx = buildContext(opts)
      const projectsDir = join(ctx.vaultPath, ctx.config.projectsDir)

      const resolvedArchive = archivePath.startsWith('/')
        ? archivePath
        : join(ctx.vaultPath, archivePath)

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
        console.log(`  task     ${t.replace(ctx.vaultPath + '/', '')}`)
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
    const ctx = buildContext(opts)
    try {
      await showPolicy(
        {
          ...(projectId !== undefined ? { projectId } : {}),
          ...(opts.tipo !== undefined ? { tipo: opts.tipo } : {}),
        },
        ctx,
      )
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e))
      process.exit(1)
    }
  })

// ── status ────────────────────────────────────────────────────────────────────

program
  .command('status')
  .description('Show task dependency status for a project')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--project <id>', 'Project ID (required)')
  .action(async (opts: { vault?: string; project?: string }) => {
    if (!opts.project) {
      console.error('Error: --project <id> is required')
      process.exit(1)
    }
    const ctx = buildContext(opts)
    try {
      await showTaskStatus({ projectId: opts.project }, ctx)
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e))
      process.exit(1)
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
    const { snapshotCommands } = await import('./commands/snapshot.js')
    const ctx = buildContext(opts)
    const result = (await snapshotCommands[0]!.handler({ tipo: opts.tipo }, ctx)) as {
      count: number
      projects: Array<{ id: string; health: string; progresso: number }>
    }
    if (opts.dryRun) {
      console.log(JSON.stringify(result.projects, null, 2))
    } else {
      for (const p of result.projects) {
        console.log(`  ${p.id.padEnd(28)} health=${p.health} progresso=${p.progresso}%`)
      }
    }
  })

// ── archive-task ──────────────────────────────────────────────────────────────

program
  .command('archive-task <project> <task-id>')
  .description('Mark a task as done (progresso: 100) and move it to tasks/archive/')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .action(async (projectId: string, taskId: string, opts: { vault?: string }) => {
    const ctx = buildContext(opts)
    try {
      const { archivedPath } = await archiveTask({ projectId, taskId }, ctx)
      console.log(`  archived  ${archivedPath.replace(ctx.vaultPath + '/', '')}`)
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e))
      process.exit(1)
    }
  })

// ── report ────────────────────────────────────────────────────────────────────

program
  .command('report')
  .description('Summarise last 24h of agent runs → 60_Agents/5_Inbox/YYYYMMdd-report.md')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--hours <n>', 'Lookback window in hours (default: 24)', '24')
  .option('--dry-run', 'Print to stdout without writing')
  .action(async (opts: { vault?: string; hours?: string; dryRun?: boolean }) => {
    const ctx = buildContext(opts)
    const { markdown, runs, outPath } = await generateReport(
      { hours: Number(opts.hours ?? 24) },
      ctx,
    )
    if (opts.dryRun) {
      process.stdout.write(markdown)
    } else {
      console.log(`  written  ${outPath!.replace(ctx.vaultPath + '/', '')}  (${runs} runs)`)
    }
  })

// ── backlinks ─────────────────────────────────────────────────────────────────

program
  .command('backlinks <note>')
  .description('Find all vault files linking to a note (wikilinks + markdown links)')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .action(async (note: string, opts: { vault?: string }) => {
    const { findBacklinks } = await import('./vault/backlinks.js')
    const ctx = buildContext(opts)
    const notePath = note.startsWith('/') ? note : join(ctx.vaultPath, note)
    const results = await findBacklinks(ctx.vaultPath, notePath)

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
    const ctx = buildContext(opts)
    const { markdown, outPath } = await generatePlan({}, ctx)
    if (opts.dryRun) {
      process.stdout.write(markdown + '\n')
    } else {
      const { scanVault } = await import('./vault/index.js')
      const vault = await scanVault(ctx.config)
      console.log(
        `  written  ${outPath!.replace(ctx.vaultPath + '/', '')}  (${vault.projects.length} projects)`,
      )
    }
  })

// ── insights ──────────────────────────────────────────────────────────────────

program
  .command('insights')
  .description('Emit a vault_snapshot event with inbox/zettelkasten/projects counts')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .action(async (opts: { vault?: string }) => {
    const ctx = buildContext(opts)
    await emitInsights({}, ctx)
  })

// ── serve ─────────────────────────────────────────────────────────────────────

program
  .command('serve')
  .description('Start HTTP status server (default port: 2948)')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--port <n>', 'Port to listen on', '2948')
  .action(async (opts: { vault?: string; port?: string }) => {
    const { createServer } = await import('./server/index.js')
    const ctx = buildContext(opts)
    await createServer(ctx.config, { port: Number(opts.port ?? 2948) })
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
