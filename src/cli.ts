#!/usr/bin/env node
import { Command } from 'commander'
import { join } from 'node:path'
import { morning } from './morning/index.js'
import { defineConfig } from './config.js'
import { storeAssets, pullAssets, statusAssets } from './assets/index.js'
import { scanVault, appendLogbook, updateProjectStatus, readProject } from './vault/index.js'
import { runAgent } from './pm/executor.js'
import { processInbox, MAX_CHARS_PER_RUN } from './inbox/index.js'
import { migrate } from './migrate/index.js'

import type { VaultAgent, VaultProject } from './vault/index.js'
import type { TavernaConfig } from './config.js'
import type { ExecutorOptions } from './pm/executor.js'

function getVaultPath(opts: { vault?: string }): string {
  const vaultPath = opts.vault ?? process.env['VAULT_PATH']
  if (!vaultPath) {
    console.error('Error: vault path required (--vault <path> or VAULT_PATH env var)')
    process.exit(1)
  }
  return vaultPath
}

function fmtSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`
  return `${bytes} B`
}

async function runOnce(
  agent: VaultAgent,
  project: VaultProject,
  runOpts: ExecutorOptions,
  config: TavernaConfig,
  dryRun: boolean,
): Promise<{ success: boolean }> {
  const result = await runAgent(agent, project, runOpts)

  if (dryRun) {
    console.log(result.output)
    return { success: true }
  }

  // Only advance lastRun on success — failures retry on the next cycle
  await updateProjectStatus(project.filePath, {
    ...(result.success ? { lastRun: new Date().toISOString() } : {}),
    lastStatus: result.success ? 'success' : 'failed',
    runsTotal: project.runsTotal + 1,
  })
  await appendLogbook(agent.id, {
    projectName: project.id,
    content: [
      `**Success:** ${result.success}`,
      `**Duration:** ${(result.durationMs / 1000).toFixed(1)}s`,
      ...(result.resultado ? [`**Resultado:** ${result.resultado}`] : []),
      ...(result.error ? [`**Error:** ${result.error}`] : []),
    ].join('\n'),
    success: result.success,
    duration: result.durationMs / 1000,
  }, config)

  console.log(result.success ? `  done (${result.durationMs}ms)` : `  failed: ${result.error}`)
  if (result.resultado) console.log(`  RESULTADO: ${result.resultado}`)
  return { success: result.success }
}

// Runs up to maxTasks agent iterations on a project, re-reading state between each.
async function drainProject(
  agent: VaultAgent,
  project: VaultProject,
  maxTasks: number,
  runOpts: ExecutorOptions,
  config: TavernaConfig,
  dryRun: boolean,
): Promise<void> {
  let current = project
  for (let i = 0; i < maxTasks; i++) {
    const pending = current.tasks.filter(t => t.progresso < 100)
    if (pending.length === 0) {
      console.log(`  no pending tasks remaining`)
      break
    }
    if (maxTasks > 1) console.log(`  [${i + 1}/${maxTasks}] ${pending[0]!.id}`)
    const { success } = await runOnce(agent, current, runOpts, config, dryRun)
    if (!success || dryRun) break
    if (i < maxTasks - 1) {
      current = await readProject(current.filePath, config.uspFolderPrefixes)
    }
  }
}

const program = new Command('taverna')
  .description('Vault-first project orchestrator')
  .version('0.1.0')

// ── morning ───────────────────────────────────────────────────────────────────

program
  .command('morning')
  .description("Generate morning dashboard with yesterday's results and project priorities")
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--dry-run', 'Print to stdout instead of writing to inbox')
  .action(async (opts: { vault?: string; dryRun?: boolean }) => {
    const config = defineConfig({ vaultPath: getVaultPath(opts) })
    await morning(config, { dryRun: opts.dryRun ?? false })
  })

// ── assets ────────────────────────────────────────────────────────────────────

const assetsCmd = program
  .command('assets')
  .description('Manage heavy assets outside the vault git repo')

assetsCmd
  .command('store <project>')
  .description('Upload assets to remote and create .asset pointer files')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--copyparty <url>', 'Copyparty server URL')
  .option('--gdrive', 'Also upload to Google Drive via rclone')
  .option('--dry-run', 'Show what would be stored without uploading')
  .action(async (project: string, opts: { vault?: string; copyparty?: string; gdrive?: boolean; dryRun?: boolean }) => {
    const vaultPath = getVaultPath(opts)
    const config = defineConfig({
      vaultPath,
      ...(opts.copyparty ? { copypartyUrl: opts.copyparty } : {}),
    })
    const assetsDir = join(vaultPath, config.projectsDir, project, 'assets')
    const result = await storeAssets(assetsDir, {
      vaultPath,
      extensions: config.assetExtensions,
      ...(config.copypartyUrl ? { copypartyUrl: config.copypartyUrl } : {}),
      ...(opts.gdrive ? { gdriveRemote: config.gdriveRemote, gdriveBasePath: config.gdriveBasePath } : {}),
      ...(opts.dryRun ? { dryRun: true as const } : {}),
    })

    for (const f of result.stored) console.log(`  stored  ${f.replace(vaultPath + '/', '')}`)
    for (const f of result.skipped) console.log(`  skip    ${f.replace(vaultPath + '/', '')}`)
    for (const e of result.errors) console.error(`  error   ${e.file}: ${e.error}`)
    console.log(`\n${result.stored.length} stored, ${result.skipped.length} skipped, ${result.errors.length} errors`)
  })

assetsCmd
  .command('pull <project>')
  .description('Download missing or modified assets from copyparty')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--dry-run', 'Show what would be downloaded without fetching')
  .action(async (project: string, opts: { vault?: string; dryRun?: boolean }) => {
    const vaultPath = getVaultPath(opts)
    const config = defineConfig({ vaultPath })
    const assetsDir = join(vaultPath, config.projectsDir, project, 'assets')
    const result = await pullAssets(assetsDir, { ...(opts.dryRun ? { dryRun: true as const } : {}) })

    for (const f of result.downloaded) console.log(`  pulled  ${f.replace(vaultPath + '/', '')}`)
    for (const f of result.skipped) console.log(`  ok      ${f.replace(vaultPath + '/', '')}`)
    for (const e of result.errors) console.error(`  error   ${e.file}: ${e.error}`)
    console.log(`\n${result.downloaded.length} downloaded, ${result.skipped.length} up-to-date, ${result.errors.length} errors`)
  })

assetsCmd
  .command('status <project>')
  .description('Show local vs remote asset state')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .action(async (project: string, opts: { vault?: string }) => {
    const vaultPath = getVaultPath(opts)
    const config = defineConfig({ vaultPath })
    const assetsDir = join(vaultPath, config.projectsDir, project, 'assets')
    const statuses = await statusAssets(assetsDir, config.assetExtensions)

    if (statuses.length === 0) {
      console.log('No assets found.')
      return
    }

    const icons: Record<string, string> = { ok: 'ok      ', missing: 'missing ', modified: 'modified', 'no-pointer': 'unstored' }
    for (const s of statuses) {
      const size = s.size !== undefined ? ` (${fmtSize(s.size)})` : ''
      console.log(`  ${icons[s.state]}  ${s.relativePath}${size}`)
    }
  })

// ── run ───────────────────────────────────────────────────────────────────────

program
  .command('run [agent]')
  .description('Run an agent on a project. Agent is auto-detected from project frontmatter or tipo if omitted.')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--project <id>', 'Project ID (required when agent is omitted)')
  .option('--dry-run', 'Print the prompt without executing')
  .option('--max-chars <n>', 'Max context chars', '8000')
  .option('--timeout <ms>', 'Agent timeout in ms', '600000')
  .option('--drain', 'Run tasks sequentially until done or --max-tasks is reached')
  .option('--max-tasks <n>', 'Max tasks per drain session (default: 3)', '3')
  .action(async (agentId: string | undefined, opts: { vault?: string; project?: string; dryRun?: boolean; maxChars?: string; timeout?: string; drain?: boolean; maxTasks?: string }) => {
    const vaultPath = getVaultPath(opts)
    const config = defineConfig({ vaultPath })
    const vault = await scanVault(config)

    const projects = opts.project
      ? vault.projects.filter(p => p.id === opts.project || p.name === opts.project)
      : agentId
        ? vault.projects.filter(p => {
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
    }
    const maxTasks = opts.drain ? Number(opts.maxTasks ?? 3) : 1

    for (const project of projects) {
      const resolvedAgentName = agentId
        ? (agentId.startsWith('@') ? agentId : `@${agentId}`)
        : project.agent ?? config.agentDefaults[project.tipo]

      if (!resolvedAgentName) {
        console.error(`  skip ${project.id}: no agent declared and no default for tipo "${project.tipo}"`)
        continue
      }

      const agent = vault.agents.find(a => a.id === resolvedAgentName || a.folderName === resolvedAgentName)
      if (!agent) {
        console.error(`  skip ${project.id}: agent ${resolvedAgentName} not found (available: ${vault.agents.map(a => a.id).join(', ')})`)
        continue
      }

      console.log(`\nRunning ${agent.id} on ${project.id}${maxTasks > 1 ? ` (drain ≤${maxTasks} tasks)` : ''}…`)
      await drainProject(agent, project, maxTasks, runOpts, config, opts.dryRun ?? false)
    }
  })

// ── execute ───────────────────────────────────────────────────────────────────

program
  .command('execute')
  .description('Run agents on all eligible projects')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--dry-run', 'Print prompts without executing')
  .option('--drain', 'Run tasks sequentially per project until done or --max-tasks is reached')
  .option('--max-tasks <n>', 'Max tasks per project per drain session (default: 3)', '3')
  .action(async (opts: { vault?: string; dryRun?: boolean; drain?: boolean; maxTasks?: string }) => {
    const vaultPath = getVaultPath(opts)
    const config = defineConfig({ vaultPath })
    const vault = await scanVault(config)

    const now = Date.now()
    const freqMs: Record<string, number> = {
      hourly: 3_600_000,
      daily: 86_400_000,
      weekly: 604_800_000,
      monthly: 2_592_000_000,
    }

    const eligible = vault.projects.filter(p => {
      if (!p.agent || p.runEvery === 'never') return false
      if (!p.lastRun) return true
      const freq = freqMs[p.runEvery]
      if (!freq) return false
      return now - new Date(p.lastRun).getTime() >= freq
    })

    if (eligible.length === 0) {
      console.log('No eligible projects.')
      return
    }

    const maxTasks = opts.drain ? Number(opts.maxTasks ?? 3) : 1

    for (const project of eligible) {
      const resolvedAgentName = project.agent ?? config.agentDefaults[project.tipo]
      const agent = vault.agents.find(a => a.id === resolvedAgentName || a.folderName === resolvedAgentName)
      if (!agent) {
        console.error(`  skip ${project.id}: agent ${resolvedAgentName} not found`)
        continue
      }
      console.log(`\n${project.id} → ${agent.id}${maxTasks > 1 ? ` (drain ≤${maxTasks} tasks)` : ''}`)
      await drainProject(agent, project, maxTasks, {}, config, opts.dryRun ?? false)
    }
  })

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
      if (result.skipped > 0) console.log(`  deferred:  ${result.skipped} (over char limit, next run)`)
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
  .action(async (archivePath: string, opts: { vault?: string; id?: string; tasks?: boolean; dryRun?: boolean }) => {
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
  })

program.parse()
