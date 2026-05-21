import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { VaultAgent, VaultProject } from '../vault/types.js'
import { updateCompletedTaskSessionId } from '../vault/update.js'
import { buildPrompt } from './prompt.js'
import { log } from './loki.js'

export interface ExecutorOptions {
  maxContextChars?: number
  timeoutMs?: number
  permissionMode?: string
  dryRun?: boolean
  previousOutput?: string
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
  durationMs: number
  sessionId?: string
  usage?: TokenUsage
  error?: string
}

export function parseResultado(output: string): string | undefined {
  const line = output.split('\n').find(l => l.startsWith('RESULTADO:'))
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
  } catch { /* ignore */ }
}

interface ClaudeJsonResult {
  text: string
  usage?: TokenUsage
}

function parseClaudeJson(raw: string): ClaudeJsonResult {
  try {
    const parsed = JSON.parse(raw)
    const u = parsed?.usage
    const usage: TokenUsage | undefined = u ? {
      tokensIn:  u.input_tokens ?? 0,
      tokensOut: u.output_tokens ?? 0,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheFill: u.cache_creation_input_tokens ?? 0,
    } : undefined
    return usage ? { text: String(parsed?.result ?? raw), usage } : { text: String(parsed?.result ?? raw) }
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
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error(`claude timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    proc.on('close', code => {
      clearTimeout(timer)
      const parsed = parseClaudeJson(stdout)
      if (logFile) {
        try { writeFileSync(logFile, parsed.text) } catch { /* ignore */ }
        setTimeout(() => {
          killTmuxSession(sessionName!)
          try { unlinkSync(logFile) } catch { /* ignore */ }
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

  const permissionMode = opts?.permissionMode ?? (agent.permissions ? 'default' : 'bypassPermissions')
  const allowedTools = agent.permissions

  const prompt = buildPrompt(agent, project, maxContextChars, opts?.previousOutput)

  if (opts?.dryRun) {
    return { success: true, output: prompt, durationMs: 0 }
  }

  const agentLabel = agent.id
  const projectLabel = project.id

  // tmux session name: taverna-dev-agent-taverna (visible via `tmux ls`)
  const sessionName = `taverna-${agentLabel.replace('@', '')}-${projectLabel}`
  const sessionId = randomUUID()
  const pendingTaskPaths = project.tasks
    .filter(t => t.progresso < 100)
    .map(t => t.filePath)

  const start = Date.now()
  try {
    const { text, usage } = await spawnClaude(prompt, permissionMode, timeoutMs, allowedTools, sessionName, sessionId)
    const durationMs = Date.now() - start
    const resultado = parseResultado(text)
    if (pendingTaskPaths.length > 0) {
      await updateCompletedTaskSessionId(pendingTaskPaths, sessionId)
    }
    log({
      event: 'agent_run', project: projectLabel, agent: agentLabel, status: 'success',
      duration_s: Math.round(durationMs / 100) / 10,
      ...(usage ? { tokens_in: usage.tokensIn, tokens_out: usage.tokensOut, cache_read: usage.cacheRead, cache_fill: usage.cacheFill } : {}),
    })
    return {
      success: true,
      output: text,
      durationMs,
      sessionId,
      ...(usage ? { usage } : {}),
      ...(resultado !== undefined ? { resultado } : {}),
    }
  } catch (e) {
    const durationMs = Date.now() - start
    log({ event: 'agent_run', project: projectLabel, agent: agentLabel, status: 'failed', duration_s: Math.round(durationMs / 100) / 10 })
    return {
      success: false,
      output: '',
      durationMs,
      error: String(e),
    }
  }
}
