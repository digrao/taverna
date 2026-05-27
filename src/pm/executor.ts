import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { VaultAgent, VaultProject, VaultTask } from '../vault/types.js'
import { isBlocked, hasCycle } from '../vault/task.js'
import { updateCompletedTaskSessionId, markTasksInProgress } from '../vault/update.js'
import { buildPrompt, buildSessionPrompt } from './prompt.js'
import { writeLogtaskFile } from './session.js'
import type { SessionSpec } from './session.js'
import { parseActionRequired } from '../inbox/action.js'
import { log } from './loki.js'
import { resolvePolicy } from './policy-resolver.js'
import { checkBudget, recordCost, loadVaultBudgetConfig } from './budget.js'
import type { BudgetConfig } from './budget.js'
import {
  formatAgentRunMessage,
  formatActionRequiredMessage,
  formatAgentStartMessage,
} from './matrix.js'
import { getNotifier } from '../notifications/index.js'
import { markActive, markInactive } from './active.js'

export interface ExecutorOptions {
  maxContextChars?: number
  timeoutMs?: number
  permissionMode?: string
  dryRun?: boolean
  previousOutput?: string
  vaultPath?: string
}

export interface TokenUsage {
  tokensIn: number
  tokensOut: number
  cacheRead: number
  cacheFill: number
}

export interface AgentResult {
  success: boolean
  output: string
  resultado?: string
  actionRequired?: string
  durationMs: number
  sessionId?: string
  usage?: TokenUsage
  error?: string
}

export function parseResultado(output: string): string | undefined {
  const line = output.split('\n').find((l) => l.startsWith('RESULTADO:'))
  return line ? line.replace(/^RESULTADO:\s*/, '').trim() || undefined : undefined
}

// Creates a named tmux session tailing the log file so the user can attach and watch.
// Returns the session name, or undefined if tmux is unavailable.
function openTmuxSession(sessionName: string, logFile: string): string | undefined {
  try {
    const r = spawn('tmux', ['new-session', '-d', '-s', sessionName, `tail -F "${logFile}"`], {
      stdio: 'ignore',
      detached: true,
    })
    r.unref()
    return sessionName
  } catch {
    return undefined
  }
}

function killTmuxSession(sessionName: string): void {
  try {
    spawn('tmux', ['kill-session', '-t', sessionName], { stdio: 'ignore', detached: true }).unref()
  } catch {
    /* ignore */
  }
}

interface ClaudeJsonResult {
  text: string
  usage?: TokenUsage
}

function parseClaudeJson(raw: string): ClaudeJsonResult {
  try {
    const parsed = JSON.parse(raw)
    const u = parsed?.usage
    const usage: TokenUsage | undefined = u
      ? {
          tokensIn: u.input_tokens ?? 0,
          tokensOut: u.output_tokens ?? 0,
          cacheRead: u.cache_read_input_tokens ?? 0,
          cacheFill: u.cache_creation_input_tokens ?? 0,
        }
      : undefined
    return usage
      ? { text: String(parsed?.result ?? raw), usage }
      : { text: String(parsed?.result ?? raw) }
  } catch {
    return { text: raw }
  }
}

function spawnClaude(
  prompt: string,
  permissionMode: string,
  timeoutMs: number,
  allowedTools?: string[],
  sessionName?: string,
  sessionId?: string,
): Promise<ClaudeJsonResult> {
  const args = ['--print', '--output-format', 'json', '--permission-mode', permissionMode]
  if (allowedTools && allowedTools.length > 0) {
    args.push('--allowedTools', allowedTools.join(','))
  }
  if (sessionId) {
    args.push('--session-id', sessionId)
  }

  const logFile = sessionName ? join(tmpdir(), `taverna-${sessionName}.log`) : undefined
  if (logFile) {
    writeFileSync(logFile, '(waiting for claude...)\n')
    openTmuxSession(sessionName!, logFile)
  }

  return new Promise((resolve, reject) => {
    const proc = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString()
    })
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
    })

    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error(`claude timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    proc.on('close', (code) => {
      clearTimeout(timer)
      const parsed = parseClaudeJson(stdout)
      if (logFile) {
        try {
          writeFileSync(logFile, parsed.text)
        } catch {
          /* ignore */
        }
        setTimeout(() => {
          killTmuxSession(sessionName!)
          try {
            unlinkSync(logFile)
          } catch {
            /* ignore */
          }
        }, 3000)
      }
      if (code === 0) resolve(parsed)
      else reject(new Error(`claude exited with code ${code}: ${stderr.slice(0, 200)}`))
    })

    proc.on('error', reject)
    proc.stdin.write(prompt)
    proc.stdin.end()
  })
}

export interface AgentSessionPayload {
  agent: VaultAgent
  project: VaultProject
  tasks: VaultTask[]
}

export async function runSession(
  payload: AgentSessionPayload,
  opts?: ExecutorOptions,
): Promise<AgentResult> {
  const { agent, project, tasks } = payload
  const maxContextChars = opts?.maxContextChars ?? 8000
  const timeoutMs = opts?.timeoutMs ?? 600_000

  const policy = resolvePolicy(agent, project)
  const permissionMode = opts?.permissionMode ?? policy.permissionMode
  const allowedTools = policy.allowedTools

  const agentLabel = agent.id
  const projectLabel = project.id

  const vaultPath = opts?.vaultPath
  if (vaultPath) {
    const globalConfig = loadVaultBudgetConfig(vaultPath)
    if (globalConfig.tokens_daily !== undefined || globalConfig.usd_daily !== undefined) {
      const globalBudget = checkBudget(vaultPath, '__global__', globalConfig)
      if (!globalBudget.allowed) {
        log({
          event: 'agent_run',
          project: projectLabel,
          agent: agentLabel,
          status: 'failed',
          duration_s: 0,
        })
        const detail =
          globalBudget.limit_tokens !== undefined
            ? `${globalBudget.spent_tokens} / ${globalBudget.limit_tokens} tokens`
            : `$${globalBudget.spent_usd.toFixed(4)} / $${globalBudget.limit_usd?.toFixed(2)}`
        return {
          success: false,
          output: '',
          durationMs: 0,
          error: `BUDGET: global budget excedido (${detail})`,
        }
      }
    }

    const projectBudgetConfig: BudgetConfig = {
      ...(typeof project.raw['budget_usd_daily'] === 'number'
        ? { usd_daily: project.raw['budget_usd_daily'] as number }
        : {}),
      ...(typeof project.raw['budget_tokens_daily'] === 'number'
        ? { tokens_daily: project.raw['budget_tokens_daily'] as number }
        : {}),
    }
    if (
      projectBudgetConfig.usd_daily !== undefined ||
      projectBudgetConfig.tokens_daily !== undefined
    ) {
      const budget = checkBudget(vaultPath, projectLabel, projectBudgetConfig)
      if (!budget.allowed) {
        log({
          event: 'agent_run',
          project: projectLabel,
          agent: agentLabel,
          status: 'failed',
          duration_s: 0,
        })
        const detail =
          budget.limit_tokens !== undefined
            ? `${budget.spent_tokens} / ${budget.limit_tokens} tokens`
            : `$${budget.spent_usd.toFixed(4)} / $${budget.limit_usd?.toFixed(2)}`
        return {
          success: false,
          output: '',
          durationMs: 0,
          error: `BUDGET: limite diário atingido (${detail})`,
        }
      }
    }
  }

  const sessionId = randomUUID()
  const logtaskPath = await writeLogtaskFile(
    {
      session_id: sessionId,
      status: 'in-progress',
      project: projectLabel,
      agent: agentLabel,
      tasks: tasks.map((t) => t.id),
      _session_started: new Date().toISOString(),
    } satisfies SessionSpec,
    tasks,
  )

  const prompt = await buildSessionPrompt(
    agent,
    project,
    tasks,
    maxContextChars,
    sessionId,
    logtaskPath,
  )

  if (opts?.dryRun) {
    return { success: true, output: prompt, durationMs: 0 }
  }

  const taskPaths = tasks.map((t) => t.filePath)
  await markTasksInProgress(taskPaths, sessionId)

  const sessionName = `taverna-session-${projectLabel}`
  markActive({
    project: projectLabel,
    agent: agentLabel,
    sessionId,
    startedAt: new Date().toISOString(),
    tmuxSession: sessionName,
  })

  getNotifier()
    .send({
      text: formatAgentStartMessage(projectLabel, agentLabel, sessionName, sessionId),
      urgency: 'info',
      project: project.id,
      agent: agent.id,
      sessionId,
    })
    .catch(() => {})

  const start = Date.now()
  try {
    const { text, usage } = await spawnClaude(
      prompt,
      permissionMode,
      timeoutMs,
      allowedTools,
      sessionName,
      sessionId,
    )
    const durationMs = Date.now() - start
    const resultado = parseResultado(text)
    const actionRequired = parseActionRequired(text)

    await updateCompletedTaskSessionId(taskPaths, sessionId)

    const cost_usd = usage
      ? Math.round(
          ((usage.tokensIn * 3 +
            usage.tokensOut * 15 +
            usage.cacheFill * 3.75 +
            usage.cacheRead * 0.3) /
            1_000_000) *
            10_000,
        ) / 10_000
      : undefined
    const cache_hit_pct =
      usage && usage.tokensIn + usage.cacheRead > 0
        ? Math.round((usage.cacheRead / (usage.tokensIn + usage.cacheRead)) * 1000) / 10
        : undefined

    log({
      event: 'agent_run',
      project: projectLabel,
      agent: agentLabel,
      status: 'success',
      duration_s: Math.round(durationMs / 100) / 10,
      ...(usage
        ? {
            tokens_in: usage.tokensIn,
            tokens_out: usage.tokensOut,
            cache_read: usage.cacheRead,
            cache_fill: usage.cacheFill,
          }
        : {}),
      ...(cost_usd !== undefined ? { cost_usd } : {}),
      ...(cache_hit_pct !== undefined ? { cache_hit_pct } : {}),
    })

    markInactive(projectLabel)

    if (vaultPath && cost_usd !== undefined) {
      try {
        recordCost(
          vaultPath,
          projectLabel,
          agentLabel,
          cost_usd,
          usage
            ? {
                in: usage.tokensIn,
                out: usage.tokensOut,
                cache_read: usage.cacheRead,
                cache_fill: usage.cacheFill,
              }
            : undefined,
        )
      } catch {
        /* non-fatal */
      }
    }

    const notifyMsg = actionRequired
      ? formatActionRequiredMessage(projectLabel, agentLabel, actionRequired, sessionId)
      : formatAgentRunMessage(projectLabel, agentLabel, resultado, sessionId)
    getNotifier()
      .send({
        text: notifyMsg,
        urgency: actionRequired ? 'critical' : 'info',
        project: project.id,
        agent: agent.id,
        sessionId,
      })
      .catch(() => {})

    return {
      success: true,
      output: text,
      durationMs,
      sessionId,
      ...(usage ? { usage } : {}),
      ...(resultado !== undefined ? { resultado } : {}),
      ...(actionRequired !== undefined ? { actionRequired } : {}),
    }
  } catch (e) {
    markInactive(projectLabel)
    const durationMs = Date.now() - start
    log({
      event: 'agent_run',
      project: projectLabel,
      agent: agentLabel,
      status: 'failed',
      duration_s: Math.round(durationMs / 100) / 10,
    })
    return { success: false, output: '', durationMs, error: String(e) }
  }
}

export async function runPipeline(
  agents: VaultAgent[],
  project: VaultProject,
  opts?: ExecutorOptions,
): Promise<AgentResult[]> {
  const results: AgentResult[] = []
  let previousOutput: string | undefined

  for (const agent of agents) {
    const result = await runAgent(agent, project, {
      ...opts,
      ...(previousOutput !== undefined ? { previousOutput } : {}),
    })
    results.push(result)
    if (!result.success) break
    previousOutput = result.output
  }

  return results
}

export async function runAgent(
  agent: VaultAgent,
  project: VaultProject,
  opts?: ExecutorOptions,
): Promise<AgentResult> {
  const maxContextChars = opts?.maxContextChars ?? 8000
  const timeoutMs = opts?.timeoutMs ?? 600_000

  const policy = resolvePolicy(agent, project)
  const permissionMode = opts?.permissionMode ?? policy.permissionMode
  const allowedTools = policy.allowedTools

  const agentLabel = agent.id
  const projectLabel = project.id

  if (hasCycle(project.tasks)) {
    log({
      event: 'agent_run',
      project: projectLabel,
      agent: agentLabel,
      status: 'failed',
      duration_s: 0,
    })
    return {
      success: false,
      output: '',
      durationMs: 0,
      error: 'BLOCKED: circular dependency detected',
    }
  }

  const allPending = project.tasks.filter((t) => t.progresso < 100)
  if (allPending.length > 0) {
    const unblocked = allPending.filter((t) => !isBlocked(t, project.tasks).blocked)
    if (unblocked.length === 0) {
      log({
        event: 'agent_run',
        project: projectLabel,
        agent: agentLabel,
        status: 'failed',
        duration_s: 0,
      })
      return {
        success: false,
        output: '',
        durationMs: 0,
        error: 'BLOCKED: all pending tasks have unsatisfied dependencies',
      }
    }
  }

  // Budget checks
  const vaultPath = opts?.vaultPath
  if (vaultPath) {
    // 1. Global token budget (from taverna.config.yaml)
    const globalConfig = loadVaultBudgetConfig(vaultPath)
    if (globalConfig.tokens_daily !== undefined || globalConfig.usd_daily !== undefined) {
      const globalBudget = checkBudget(vaultPath, '__global__', globalConfig)
      if (!globalBudget.allowed) {
        log({
          event: 'agent_run',
          project: projectLabel,
          agent: agentLabel,
          status: 'failed',
          duration_s: 0,
        })
        const detail =
          globalBudget.limit_tokens !== undefined
            ? `${globalBudget.spent_tokens} / ${globalBudget.limit_tokens} tokens`
            : `$${globalBudget.spent_usd.toFixed(4)} / $${globalBudget.limit_usd?.toFixed(2)}`
        return {
          success: false,
          output: '',
          durationMs: 0,
          error: `BUDGET: global budget excedido (${detail})`,
        }
      }
    }

    // 2. Per-project budget (budget_usd_daily / budget_tokens_daily in frontmatter)
    const projectBudgetConfig: BudgetConfig = {
      ...(typeof project.raw['budget_usd_daily'] === 'number'
        ? { usd_daily: project.raw['budget_usd_daily'] as number }
        : {}),
      ...(typeof project.raw['budget_tokens_daily'] === 'number'
        ? { tokens_daily: project.raw['budget_tokens_daily'] as number }
        : {}),
    }
    if (
      projectBudgetConfig.usd_daily !== undefined ||
      projectBudgetConfig.tokens_daily !== undefined
    ) {
      const budget = checkBudget(vaultPath, projectLabel, projectBudgetConfig)
      if (!budget.allowed) {
        log({
          event: 'agent_run',
          project: projectLabel,
          agent: agentLabel,
          status: 'failed',
          duration_s: 0,
        })
        const detail =
          budget.limit_tokens !== undefined
            ? `${budget.spent_tokens} / ${budget.limit_tokens} tokens`
            : `$${budget.spent_usd.toFixed(4)} / $${budget.limit_usd?.toFixed(2)}`
        return {
          success: false,
          output: '',
          durationMs: 0,
          error: `BUDGET: limite diário atingido (${detail})`,
        }
      }
    }
  }

  const prompt = await buildPrompt(agent, project, maxContextChars, opts?.previousOutput)

  if (opts?.dryRun) {
    return { success: true, output: prompt, durationMs: 0 }
  }

  // tmux session name: taverna-dev-agent-taverna (visible via `tmux ls`)
  const sessionName = `taverna-${agentLabel.replace('@', '')}-${projectLabel}`
  const sessionId = randomUUID()
  const pendingTaskPaths = project.tasks.filter((t) => t.progresso < 100).map((t) => t.filePath)

  // Write session ID to pending tasks now so the user can resume with
  // `claude --resume <_session_id>` if the agent requests intervention.
  if (pendingTaskPaths.length > 0) {
    await markTasksInProgress(pendingTaskPaths, sessionId)
  }

  markActive({
    project: projectLabel,
    agent: agentLabel,
    sessionId,
    startedAt: new Date().toISOString(),
    tmuxSession: sessionName,
  })
  getNotifier()
    .send({
      text: formatAgentStartMessage(projectLabel, agentLabel, sessionName, sessionId),
      urgency: 'info',
      project: project.id,
      agent: agent.id,
      sessionId,
    })
    .catch(() => {})
  const start = Date.now()
  try {
    const { text, usage } = await spawnClaude(
      prompt,
      permissionMode,
      timeoutMs,
      allowedTools,
      sessionName,
      sessionId,
    )
    const durationMs = Date.now() - start
    const resultado = parseResultado(text)
    const actionRequired = parseActionRequired(text)
    if (pendingTaskPaths.length > 0) {
      await updateCompletedTaskSessionId(pendingTaskPaths, sessionId)
    }
    // Sonnet 4.6 pricing: $3/MTok in, $15/MTok out, $3.75/MTok cache_fill, $0.30/MTok cache_read
    const cost_usd = usage
      ? Math.round(
          ((usage.tokensIn * 3 +
            usage.tokensOut * 15 +
            usage.cacheFill * 3.75 +
            usage.cacheRead * 0.3) /
            1_000_000) *
            10_000,
        ) / 10_000
      : undefined
    const cache_hit_pct =
      usage && usage.tokensIn + usage.cacheRead > 0
        ? Math.round((usage.cacheRead / (usage.tokensIn + usage.cacheRead)) * 1000) / 10
        : undefined
    log({
      event: 'agent_run',
      project: projectLabel,
      agent: agentLabel,
      status: 'success',
      duration_s: Math.round(durationMs / 100) / 10,
      ...(usage
        ? {
            tokens_in: usage.tokensIn,
            tokens_out: usage.tokensOut,
            cache_read: usage.cacheRead,
            cache_fill: usage.cacheFill,
          }
        : {}),
      ...(cost_usd !== undefined ? { cost_usd } : {}),
      ...(cache_hit_pct !== undefined ? { cache_hit_pct } : {}),
    })

    markInactive(projectLabel)

    // Record cost in ledger
    if (vaultPath && cost_usd !== undefined) {
      try {
        recordCost(
          vaultPath,
          projectLabel,
          agentLabel,
          cost_usd,
          usage
            ? {
                in: usage.tokensIn,
                out: usage.tokensOut,
                cache_read: usage.cacheRead,
                cache_fill: usage.cacheFill,
              }
            : undefined,
        )
      } catch {
        /* non-fatal */
      }
    }

    const sessionMsg = actionRequired
      ? formatActionRequiredMessage(projectLabel, agentLabel, actionRequired, sessionId)
      : formatAgentRunMessage(projectLabel, agentLabel, resultado, sessionId)
    getNotifier()
      .send({
        text: sessionMsg,
        urgency: actionRequired ? 'critical' : 'info',
        project: project.id,
        agent: agent.id,
        sessionId,
      })
      .catch(() => {})

    return {
      success: true,
      output: text,
      durationMs,
      sessionId,
      ...(usage ? { usage } : {}),
      ...(resultado !== undefined ? { resultado } : {}),
      ...(actionRequired !== undefined ? { actionRequired } : {}),
    }
  } catch (e) {
    markInactive(projectLabel)
    const durationMs = Date.now() - start
    log({
      event: 'agent_run',
      project: projectLabel,
      agent: agentLabel,
      status: 'failed',
      duration_s: Math.round(durationMs / 100) / 10,
    })
    return {
      success: false,
      output: '',
      durationMs,
      error: String(e),
    }
  }
}
