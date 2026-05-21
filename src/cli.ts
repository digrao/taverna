#!/usr/bin/env node
import { Command } from 'commander'
import { join } from 'node:path'
import { morning } from './morning/index.js'
import { defineConfig } from './config.js'
import { storeAssets, pullAssets, statusAssets } from './assets/index.js'
import { scanVault, appendLogbook, appendProjectLogbook, updateProjectStatus, readProject } from './vault/index.js'
import { runAgent, runPipeline } from './pm/executor.js'
import { snapshot, computeHealth } from './pm/loki.js'
import { updateBoardFile } from './usp/board.js'
import { writeActionRequest } from './inbox/action.js'
import type { ActionUrgency } from './inbox/action.js'
import { processInbox, MAX_CHARS_PER_RUN } from './inbox/index.js'
import { migrate } from './migrate/index.js'
import { fetchEntries, fetchProjects, matchEntries, writeDeepWorkToFrontmatter } from './clockify/index.js'
import type { ClockifyConfig } from './clockify/index.js'
import { runScheduler } from './pm/scheduler.js'
import type { TypePolicy } from './pm/scheduler.js'
import { defaultTypePolicies } from './pm/policies.js'

import type { VaultAgent, VaultProject } from './vault/index.js'
import type { TavernaConfig } from './config.js'
import type { ExecutorOptions } from './pm/executor.js'

function getClockifyConfig(): ClockifyConfig {
  const apiKey = process.env['CLOCKIFY_API_KEY']
  const workspaceId = process.env['CLOCKIFY_WORKSPACE_ID']
  const userId = process.env['CLOCKIFY_USER_ID']
  if (!apiKey || !workspaceId || !userId) {
    console.error('Error: CLOCKIFY_API_KEY, CLOCKIFY_WORKSPACE_ID, and CLOCKIFY_USER_ID are required')
    process.exit(1)
  }
  return { apiKey, workspaceId, userId }
}

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

  snapshot(project)

  // Per-project logbook (task 04)
  if (project.folderPath) {
    await appendProjectLogbook(project.folderPath, {
      projectName: project.id,
      content: [
        `**Agent:** ${agent.id}`,
        `**Success:** ${result.success}`,
        `**Duration:** ${(result.durationMs / 1000).toFixed(1)}s`,
        ...(result.resultado ? [`**Resultado:** ${result.resultado}`] : []),
        ...(result.error ? [`**Error:** ${result.error}`] : []),
      ].join('\n'),
      success: result.success,
      duration: result.durationMs / 1000,
    })
  }

  // Inbox notification when human action is needed (task 03)
  if (!dryRun) {
    const blockedTasks = project.tasks.filter(t => t.bloqueio || (t.requerHumano && t.requerHumano.length > 0))
    const snap = computeHealth(project)

    if (result.actionRequired) {
      await writeActionRequest(config.vaultPath, {
        projeto: project.id,
        agente: agent.id,
        urgencia: 'high',
        oQueAconteceu: result.actionRequired,
        acoes: ['Resolver o bloqueio indicado pelo agente e rodar novamente'],
        contexto: result.output,
      })
    } else if (blockedTasks.length > 0) {
      const urgencia: ActionUrgency = snap.health === 'overdue' || blockedTasks.some(t => t.bloqueio) ? 'high' : 'medium'
      const acoes = blockedTasks.flatMap(t => [
        ...(t.bloqueio ? [`[${t.id}] Resolver bloqueio: ${t.bloqueioDetalhe ?? t.bloqueio}`] : []),
        ...(t.requerHumano ?? []).map(a => `[${t.id}] ${a}`),
      ])
      await writeActionRequest(config.vaultPath, {
        projeto: project.id,
        agente: agent.id,
        urgencia,
        oQueAconteceu: `${blockedTasks.length} task(s) aguardando ação humana`,
        acoes,
      })
    }
  }

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
  .option('--pipeline', 'Run agents listed in project.pipeline frontmatter in sequence')
  .action(async (agentId: string | undefined, opts: { vault?: string; project?: string; dryRun?: boolean; maxChars?: string; timeout?: string; drain?: boolean; maxTasks?: string; pipeline?: boolean }) => {
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
      if (opts.pipeline) {
        const pipelineIds = project.pipeline
        if (!pipelineIds || pipelineIds.length === 0) {
          console.error(`  skip ${project.id}: no pipeline declared in frontmatter`)
          continue
        }

        const agents: VaultAgent[] = []
        for (const id of pipelineIds) {
          const agent = vault.agents.find(a => a.id === id || a.folderName === id || `@${a.folderName}` === id)
          if (!agent) {
            console.error(`  abort ${project.id}: pipeline agent ${id} not found`)
            break
          }
          agents.push(agent)
        }
        if (agents.length !== pipelineIds.length) continue

        console.log(`\nPipeline on ${project.id}: ${agents.map(a => a.id).join(' → ')}`)
        const results = await runPipeline(agents, project, { ...runOpts, dryRun: opts.dryRun ?? false })

        for (let i = 0; i < results.length; i++) {
          const r = results[i]!
          const label = agents[i]!.id
          if (opts.dryRun) {
            console.log(`\n── ${label} prompt ──\n`)
            console.log(r.output)
          } else {
            console.log(`  ${label}: ${r.success ? `done (${r.durationMs}ms)` : `failed: ${r.error}`}`)
            if (r.resultado) console.log(`  RESULTADO: ${r.resultado}`)
          }
        }

        const allSucceeded = results.every(r => r.success)
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

// ── clockify ──────────────────────────────────────────────────────────────────

const clockifyCmd = program
  .command('clockify')
  .description('Sync Clockify deep work hours into vault project frontmatter')

clockifyCmd
  .command('sync')
  .description('Fetch time entries and write deepwork stats to project frontmatter')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--days <n>', 'Lookback window in days (default: 7)', '7')
  .option('--dry-run', 'Show what would be written without modifying files')
  .action(async (opts: { vault?: string; days?: string; dryRun?: boolean }) => {
    const clockifyConfig = getClockifyConfig()
    const vaultPath = getVaultPath(opts)
    const tavernaConfig = defineConfig({ vaultPath })
    const days = Number(opts.days ?? 7)

    const to = new Date()
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const vault = await scanVault(tavernaConfig)
    const [clockifyProjects, entries] = await Promise.all([
      fetchProjects(clockifyConfig),
      fetchEntries(clockifyConfig, from, to),
    ])

    const stats = matchEntries(entries, clockifyProjects, weekStart)
    let updated = 0

    for (const stat of stats) {
      const project = vault.projects.find(p => p.id === stat.projectId)
      if (!project) continue
      if (opts.dryRun) {
        console.log(`  ${stat.projectId}: ${stat.totalHours}h total, ${stat.weekHours}h week, last: ${stat.lastEntry}`)
        continue
      }
      await writeDeepWorkToFrontmatter(project.filePath, stat)
      console.log(`  updated  ${stat.projectId}`)
      updated++
    }

    if (!opts.dryRun) {
      console.log(`\n${updated} project(s) updated`)
    }
  })

clockifyCmd
  .command('status')
  .description('Show deep work hours per project for the last 7 days')
  .action(async () => {
    const clockifyConfig = getClockifyConfig()

    const to = new Date()
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const [clockifyProjects, entries] = await Promise.all([
      fetchProjects(clockifyConfig),
      fetchEntries(clockifyConfig, from, to),
    ])

    const stats = matchEntries(entries, clockifyProjects, from)

    if (stats.length === 0) {
      console.log('No deep work logged in the last 7 days.')
      return
    }

    stats.sort((a, b) => b.weekHours - a.weekHours)
    for (const s of stats) {
      console.log(`  ${s.projectId.padEnd(24)} ${s.weekHours.toFixed(1)}h`)
    }
    const total = stats.reduce((acc, s) => acc + s.weekHours, 0)
    console.log(`\n  ${'Total'.padEnd(24)} ${total.toFixed(1)}h`)
  })

// ── policy ────────────────────────────────────────────────────────────────────

program
  .command('policy [project-id]')
  .description('Show effective scheduling policy for a project (or all projects)')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--tipo <tipo>', 'Filter by project type: USP, BB, *')
  .action(async (projectId: string | undefined, opts: { vault?: string; tipo?: string }) => {
    const { readProjectPolicy, mergePolicy, getTypePolicy } = await import('./pm/scheduler.js')
    const { computeHealth } = await import('./pm/loki.js')

    const FREQ_LABEL: Record<string, string> = {
      hourly: '1h', daily: '24h', weekly: '7d', monthly: '30d', never: 'never',
    }
    const FREQ_MS: Record<string, number> = {
      hourly: 3_600_000, daily: 86_400_000, weekly: 604_800_000, monthly: 2_592_000_000,
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
      ? vault.projects.filter(p => p.id === projectId || p.name === projectId)
      : opts.tipo
        ? vault.projects.filter(p => p.tipo === opts.tipo)
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
      console.log(`${project.id}  ·  tipo: ${project.tipo}  ·  priority: ${project.priority}  ·  runEvery: ${project.runEvery} (${FREQ_LABEL[project.runEvery] ?? '?'})`)
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

      console.log(`\nProject overrides:  ${hasOverride ? `compose=${projectPolicy!.compose}` : 'none'}`)
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
      console.log(`  Last run:    ${project.lastRun ? new Date(project.lastRun).toLocaleString('pt-BR') : 'never'} (${project.lastStatus ?? '—'})`)
      console.log(`  Runs total:  ${project.runsTotal}`)
      console.log(`  Next run:    ${fmtNextRun(project)}`)

      console.log(`\nHealth:`)
      console.log(`  Tasks:       ${snap.tasks_done}/${snap.tasks_total} done  (progresso: ${snap.progresso}%)`)
      if (snap.deadline_days !== undefined) {
        const dLabel = snap.deadline_days < 0
          ? `${Math.abs(snap.deadline_days)}d atrás`
          : snap.deadline_days === 0 ? 'hoje' : `${snap.deadline_days}d`
        console.log(`  Deadline:    ${dLabel}`)
      }
      console.log(`  Status:      ${snap.health}`)
    }
    console.log(`\n${hr}`)
  })

// ── usp-board ─────────────────────────────────────────────────────────────────

program
  .command('usp-board')
  .description('Update USP health board in 20_Areas/2_Estudos/Escola Politécnica da USP.md')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--dry-run', 'Print the generated block without writing')
  .action(async (opts: { vault?: string; dryRun?: boolean }) => {
    const vaultPath = getVaultPath(opts)
    const config = defineConfig({ vaultPath })
    const vault = await scanVault(config)
    const uspProjects = vault.projects.filter(p => p.tipo === 'USP')

    if (uspProjects.length === 0) {
      console.log('No USP projects found.')
      return
    }

    const { generateBoardBlock } = await import('./usp/board.js')
    const block = generateBoardBlock(uspProjects, new Date())

    if (opts.dryRun) {
      console.log(block)
    } else {
      const boardPath = join(vaultPath, '20_Areas', '2_Estudos', 'Escola Politécnica da USP.md')
      await updateBoardFile(boardPath, uspProjects)
      console.log(`  updated  ${boardPath.replace(vaultPath + '/', '')}`)
    }
  })

// ── snapshot ──────────────────────────────────────────────────────────────────

program
  .command('snapshot')
  .description('Emit project_snapshot events for all projects (health + priority) without running agents')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--tipo <tipo>', 'Filter by project type: USP, BB, *')
  .option('--dry-run', 'Print JSON to stdout without journal emission')
  .action(async (opts: { vault?: string; tipo?: string; dryRun?: boolean }) => {
    const vaultPath = getVaultPath(opts)
    const config = defineConfig({ vaultPath })
    const vault = await scanVault(config)

    const projects = opts.tipo
      ? vault.projects.filter(p => p.tipo === opts.tipo)
      : vault.projects

    for (const project of projects) {
      const payload = (await import('./pm/loki.js')).computeHealth(project)
      if (opts.dryRun) {
        console.log(JSON.stringify(payload, null, 2))
      } else {
        snapshot(project)
        console.log(`  ${project.id.padEnd(28)} health=${payload.health} progresso=${payload.progresso}%`)
      }
    }
  })

// ── schedule ──────────────────────────────────────────────────────────────────

program
  .command('schedule')
  .description('Run the centralized scheduler daemon (replaces systemd timers)')
  .option('--vault <path>', 'Vault path (or VAULT_PATH env var)')
  .option('--dry-run', 'Print what would run without executing agents')
  .option('--tick-ms <ms>', 'Tick interval in milliseconds (default: 60000)', '60000')
  .option('--once', 'Run one tick and exit')
  .action(async (opts: { vault?: string; dryRun?: boolean; tickMs?: string; once?: boolean }) => {
    const vaultPath = getVaultPath(opts)
    const config = defineConfig({ vaultPath })

    const typePolicies = defaultTypePolicies(config)

    const tickMs = Number(opts.tickMs ?? 60_000)
    const maxTicks = opts.once ? 1 : undefined

    console.log(`Scheduler started (tick: ${tickMs}ms${opts.once ? ', one-shot' : ''})`)
    if (opts.dryRun) console.log('Dry-run mode — no agents will execute')

    await runScheduler(config, typePolicies, {
      dryRun: opts.dryRun ?? false,
      tickMs,
      ...(maxTicks !== undefined ? { maxTicks } : {}),
    })
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
    const { existsSync } = await import('node:fs')
    const matter = (await import('gray-matter')).default

    const projectsDir = pjoin(vaultPath, config.projectsDir)
    // Support partial match: "07" matches "07-token-usage-logging"
    const { readdir } = await import('node:fs/promises')
    const entries = await readdir(pjoin(projectsDir, projectId, 'tasks')).catch(() => [] as string[])
    const match = entries.find(f => f.startsWith(taskId) && f.endsWith('.md') && !f.includes('archive'))

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
    const sorted = [...vault.projects].sort((a, b) => (PRIO_ORDER[a.priority] ?? 1) - (PRIO_ORDER[b.priority] ?? 1))

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
      const pending = project.tasks.filter(t => t.progresso < 100)
      const HEALTH_ICON: Record<string, string> = { ok: '🟢', 'at-risk': '🟡', overdue: '🔴', idle: '⚪' }
      const icon = HEALTH_ICON[snap.health] ?? '⚪'
      const prio = project.priority === 'high' ? '[HIGH]' : project.priority === 'medium' ? '[MED]' : '[LOW]'
      lines.push(`## ${icon} ${prio} ${project.id} (${project.tipo})`)

      if (snap.deadline_days !== undefined) {
        const dl = snap.deadline_days < 0 ? `${Math.abs(snap.deadline_days)}d atrasado` : `${snap.deadline_days}d`
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
    createServer(config, { port: Number(opts.port ?? 2948) })
  })

program.parse()
