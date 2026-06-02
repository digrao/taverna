import { hostname as osHostname } from 'node:os'
import type { VaultAgent, VaultProject } from '../../vault/types.js'
import type { TavernaConfig } from '../../config.js'
import { runAgent } from './executor.js'
import type { ExecutorOptions, AgentResult } from './executor.js'
import {
  appendLogbook,
  appendProjectLogbook,
  updateProjectStatus,
  readProject,
} from '../../vault/index.js'
import { snapshot, computeHealth } from '../observability/loki.js'
import { writeActionRequest } from '../../vault/inbox/action.js'
import type { ActionUrgency } from '../../vault/inbox/action.js'

export { type AgentResult }

/**
 * Run an agent once on a project. Updates logbook, project status, and emits
 * action-required inbox notifications when needed.
 *
 * Returns the full AgentResult so callers (scheduler, drain loop) can inspect
 * success/error/resultado without re-parsing.
 */
export async function runOnce(
  agent: VaultAgent,
  project: VaultProject,
  runOpts: ExecutorOptions,
  config: TavernaConfig,
  dryRun: boolean,
): Promise<AgentResult> {
  const result = await runAgent(agent, project, { ...runOpts, vaultPath: config.vaultPath })

  if (dryRun) {
    console.log(result.output)
    return result
  }

  await updateProjectStatus(project.filePath, {
    ...(result.success ? { lastRun: new Date().toISOString() } : {}),
    lastStatus: result.success ? 'success' : 'failed',
    runsTotal: project.runsTotal + 1,
  })

  await appendLogbook(
    agent.id,
    {
      projectName: project.id,
      content: [
        `**Success:** ${result.success}`,
        `**Duration:** ${(result.durationMs / 1000).toFixed(1)}s`,
        ...(result.resultado ? [`**Resultado:** ${result.resultado}`] : []),
        ...(result.error ? [`**Error:** ${result.error}`] : []),
      ].join('\n'),
      success: result.success,
      duration: result.durationMs / 1000,
    },
    config,
  )

  snapshot(project)

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

  const blockedTasks = project.tasks.filter(
    (t) => t.bloqueio || (t.requerHumano && t.requerHumano.length > 0),
  )
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
    const urgencia: ActionUrgency =
      snap.health === 'overdue' || blockedTasks.some((t) => t.bloqueio) ? 'high' : 'medium'
    const acoes = blockedTasks.flatMap((t) => [
      ...(t.bloqueio ? [`[${t.id}] Resolver bloqueio: ${t.bloqueioDetalhe ?? t.bloqueio}`] : []),
      ...(t.requerHumano ?? []).map((a) => `[${t.id}] ${a}`),
    ])
    await writeActionRequest(config.vaultPath, {
      projeto: project.id,
      agente: agent.id,
      urgencia,
      oQueAconteceu: `${blockedTasks.length} task(s) aguardando ação humana`,
      acoes,
    })
  }

  console.log(result.success ? `  done (${result.durationMs}ms)` : `  failed: ${result.error}`)
  if (result.resultado) console.log(`  RESULTADO: ${result.resultado}`)

  return result
}

/**
 * Run up to maxTasks agent iterations on a project, re-reading vault state
 * between each iteration so task progress is always current.
 */
export async function drainProject(
  agent: VaultAgent,
  project: VaultProject,
  maxTasks: number,
  runOpts: ExecutorOptions,
  config: TavernaConfig,
  dryRun: boolean,
  onRun?: (result: AgentResult, project: VaultProject) => Promise<void>,
): Promise<void> {
  const hostFilter =
    typeof project.raw['hostname'] === 'string' ? project.raw['hostname'] : undefined
  if (hostFilter && hostFilter !== osHostname()) return

  let current = project
  for (let i = 0; i < maxTasks; i++) {
    const pending = current.tasks.filter((t) => t.progresso < 100)
    if (pending.length === 0) {
      console.log(`  no pending tasks remaining`)
      break
    }
    if (maxTasks > 1) console.log(`  [${i + 1}/${maxTasks}] ${pending[0]!.id}`)
    const result = await runOnce(agent, current, runOpts, config, dryRun)
    if (onRun) await onRun(result, current)
    if (!result.success || dryRun) break
    if (i < maxTasks - 1) {
      current = await readProject(current.filePath, config.uspFolderPrefixes)
    }
  }
}
