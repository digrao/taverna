#!/usr/bin/env node
import { Command } from 'commander'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
const _req = createRequire(import.meta.url)
const { version: _version } = _req('../package.json') as { version: string }
import { defineConfig, resolveVaultPath } from './config.js'
import { executeRun, executeSessionRun, runWork } from './core/index.js'
import { migrate } from './vault/migrate/index.js'
import type { TavernaContext } from './core/types.js'

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
  return { config, vaultPath, ...(opts.dryRun !== undefined ? { dryRun: opts.dryRun } : {}) }
}

const program = new Command('taverna')
  .description('Vault-first project orchestrator')
  .version(_version)

// ── run ───────────────────────────────────────────────────────────────────────

program
  .command('run [agent]')
  .description('Run an agent on a project. Agent is auto-detected from frontmatter if omitted.')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--project <id>', 'Project ID')
  .option('--dry-run', 'Print the prompt without executing')
  .option('--max-chars <n>', 'Max context chars', '8000')
  .option('--timeout <ms>', 'Agent timeout in ms', '600000')
  .option('--drain', 'Run tasks sequentially until done or --max-tasks is reached')
  .option('--max-tasks <n>', 'Max tasks per drain session', '3')
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
  .command('run')
  .description('Run a batched session of tasks for a project')
  .requiredOption('--project <id>', 'Project ID')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--tasks <ids>', 'Comma-separated task IDs (default: all unblocked pending)')
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
// Called by systemd timers: taverna work [--drain] [--max-tasks N]

program
  .command('work')
  .description('Dispatch agents on all eligible projects and exit (one-shot)')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--dry-run', 'Print what would run without executing')
  .option('--drain', 'Run tasks sequentially per project until done')
  .option('--max-tasks <n>', 'Max tasks per project', '3')
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

// ── serve ─────────────────────────────────────────────────────────────────────

program
  .command('serve')
  .description('Start HTTP server (default port: 2948) — exposes JSON API for Grafana')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--port <n>', 'Port to listen on', '2948')
  .action(async (opts: { vault?: string; port?: string }) => {
    const { createServer } = await import('./http/server/index.js')
    const ctx = buildContext(opts)
    await createServer(ctx.config, { port: Number(opts.port ?? 2948) })
  })

// ── mcp ───────────────────────────────────────────────────────────────────────

program
  .command('mcp')
  .description('Start MCP server (stdio) — exposes core commands as tools')
  .action(async () => {
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
      console.log(`\nnext steps:\n  cd ${pluginDir}\n  npm install\n  npm run build`)
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e))
      process.exit(1)
    }
  })

program.parse()
