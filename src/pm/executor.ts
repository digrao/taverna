import { spawn } from 'node:child_process'
import type { VaultAgent, VaultProject } from '../vault/types.js'
import { buildPrompt } from './prompt.js'

export interface ExecutorOptions {
  maxContextChars?: number
  timeoutMs?: number
  permissionMode?: string
  dryRun?: boolean
}

export interface AgentResult {
  success: boolean
  output: string
  resultado?: string
  durationMs: number
  error?: string
}

export function parseResultado(output: string): string | undefined {
  const line = output.split('\n').find(l => l.startsWith('RESULTADO:'))
  return line ? line.replace(/^RESULTADO:\s*/, '').trim() || undefined : undefined
}

function spawnClaude(
  prompt: string,
  permissionMode: string,
  timeoutMs: number,
  allowedTools?: string[],
): Promise<string> {
  const args = ['--print', '--permission-mode', permissionMode]
  if (allowedTools && allowedTools.length > 0) {
    args.push('--allowedTools', allowedTools.join(','))
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
      if (code === 0) resolve(stdout)
      else reject(new Error(`claude exited with code ${code}: ${stderr.slice(0, 200)}`))
    })

    proc.on('error', reject)
    proc.stdin.write(prompt)
    proc.stdin.end()
  })
}

export async function runAgent(
  agent: VaultAgent,
  project: VaultProject,
  opts?: ExecutorOptions,
): Promise<AgentResult> {
  const maxContextChars = opts?.maxContextChars ?? 8000
  const timeoutMs = opts?.timeoutMs ?? 120_000

  // If the agent declares permissions, use default mode + explicit allowlist.
  // Otherwise fall back to bypassPermissions for backward compatibility.
  const permissionMode = opts?.permissionMode ?? (agent.permissions ? 'default' : 'bypassPermissions')
  const allowedTools = agent.permissions

  const prompt = buildPrompt(agent, project, maxContextChars)

  if (opts?.dryRun) {
    return { success: true, output: prompt, durationMs: 0 }
  }

  const start = Date.now()
  try {
    const output = await spawnClaude(prompt, permissionMode, timeoutMs, allowedTools)
    const durationMs = Date.now() - start
    const resultado = parseResultado(output)
    return {
      success: true,
      output,
      durationMs,
      ...(resultado !== undefined ? { resultado } : {}),
    }
  } catch (e) {
    return {
      success: false,
      output: '',
      durationMs: Date.now() - start,
      error: String(e),
    }
  }
}
