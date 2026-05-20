#!/usr/bin/env node
import { Command } from 'commander'
import { join } from 'node:path'
import { morning } from './morning/index.js'
import { defineConfig } from './config.js'
import { storeAssets, pullAssets, statusAssets } from './assets/index.js'
import { scanVault, appendLogbook, updateProjectStatus } from './vault/index.js'
import { runAgent } from './pm/executor.js'
import { processInbox, MAX_CHARS_PER_RUN } from './inbox/index.js'

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
  .command('run <agent>')
  .description('Run an agent on a project')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--project <id>', 'Project ID to run agent on')
  .option('--dry-run', 'Print the prompt without executing')
  .option('--max-chars <n>', 'Max context chars', '8000')
  .action(async (agentId: string, opts: { vault?: string; project?: string; dryRun?: boolean; maxChars?: string }) => {
    const vaultPath = getVaultPath(opts)
    const config = defineConfig({ vaultPath })
    const vault = await scanVault(config)

    const agentName = agentId.startsWith('@') ? agentId : `@${agentId}`
    const agent = vault.agents.find(a => a.id === agentName || a.folderName === agentName)
    if (!agent) {
      console.error(`Agent ${agentName} not found. Available: ${vault.agents.map(a => a.id).join(', ')}`)
      process.exit(1)
    }

    const projects = opts.project
      ? vault.projects.filter(p => p.id === opts.project || p.name === opts.project)
      : vault.projects.filter(p => p.agent === agentName)

    if (projects.length === 0) {
      console.error(`No projects found for agent ${agentName}`)
      process.exit(1)
    }

    for (const project of projects) {
      console.log(`\nRunning ${agentName} on ${project.id}…`)
      const result = await runAgent(agent, project, {
        ...(opts.dryRun ? { dryRun: true as const } : {}),
        ...(opts.maxChars ? { maxContextChars: Number(opts.maxChars) } : {}),
      })
      if (opts.dryRun) {
        console.log(result.output)
      } else {
        const lastStatus = result.success ? 'success' : 'failed'
        const now = new Date().toISOString()
        await updateProjectStatus(project.filePath, {
          lastRun: now,
          lastStatus,
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
      }
    }
  })

// ── execute ───────────────────────────────────────────────────────────────────

program
  .command('execute')
  .description('Run agents on all eligible projects')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--dry-run', 'Print prompts without executing')
  .action(async (opts: { vault?: string; dryRun?: boolean }) => {
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

    for (const project of eligible) {
      const agent = vault.agents.find(a => a.id === project.agent || a.folderName === project.agent)
      if (!agent) {
        console.error(`  skip ${project.id}: agent ${project.agent} not found`)
        continue
      }
      console.log(`\n${project.id} → ${agent.id}`)
      const result = await runAgent(agent, project, { ...(opts.dryRun ? { dryRun: true as const } : {}) })
      if (!opts.dryRun) {
        const lastStatus = result.success ? 'success' : 'failed'
        const now = new Date().toISOString()
        await updateProjectStatus(project.filePath, {
          lastRun: now,
          lastStatus,
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
      }
      if (opts.dryRun) {
        console.log(result.output)
      } else {
        console.log(result.success ? `  done (${result.durationMs}ms)` : `  failed: ${result.error}`)
        if (result.resultado) console.log(`  RESULTADO: ${result.resultado}`)
      }
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

program.parse()
