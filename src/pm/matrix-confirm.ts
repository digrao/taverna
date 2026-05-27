import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import matter from 'gray-matter'
import type { ScoredProject } from './scorer.js'
import { sendMatrixMessage, matrixConfigFromEnv } from './matrix.js'
import { waitForReply } from './matrix-reader.js'
import type { MatrixMessage } from './matrix-reader.js'

export type OnTimeout = 'run_all' | 'skip'

export interface MatrixSchedulerConfig {
  timeout_min: number
  on_timeout: OnTimeout
  poll_interval_ms: number
}

export type SelectionResult = 'all' | 'skip' | number[]

const CONFIG_PATH = join(
  dirname(new URL(import.meta.url).pathname),
  '..',
  '..',
  'taverna.config.yaml',
)

export function loadMatrixSchedulerConfig(configPath?: string): MatrixSchedulerConfig | undefined {
  const path = configPath ?? CONFIG_PATH
  if (!existsSync(path)) return undefined
  try {
    const raw = readFileSync(path, 'utf8')
    const parsed = matter(`---\n${raw}\n---`).data as Record<string, unknown>
    const matrixRaw = parsed['matrix']
    if (!matrixRaw || typeof matrixRaw !== 'object') return undefined
    const m = matrixRaw as Record<string, unknown>
    const timeoutMin = typeof m['timeout_min'] === 'number' ? m['timeout_min'] : 5
    const onTimeoutRaw = m['on_timeout']
    const onTimeout: OnTimeout = onTimeoutRaw === 'skip' ? 'skip' : 'run_all'
    const pollIntervalMs = typeof m['poll_interval_ms'] === 'number' ? m['poll_interval_ms'] : 5_000
    return { timeout_min: timeoutMin, on_timeout: onTimeout, poll_interval_ms: pollIntervalMs }
  } catch {
    return undefined
  }
}

export function formatConfirmMessage(
  entries: { project: string; agentId: string }[],
  now: Date,
  timeoutMin: number,
  onTimeout: OnTimeout,
): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  const onTimeoutLabel = onTimeout === 'run_all' ? 'all' : 'nada'
  return [
    `🕐 Execução agendada — ${time}`,
    `Selecione o que executar (responda com números, "all" ou "skip"):`,
    '',
    ...entries.map((e, i) => `${i + 1}. ${e.agentId} → ${e.project}`),
    '',
    `⏳ Timeout em ${timeoutMin} min → executa ${onTimeoutLabel}`,
  ].join('\n')
}

export function parseConfirmResponse(body: string, count: number): SelectionResult {
  const trimmed = body.trim().toLowerCase()
  if (trimmed === 'all') return 'all'
  if (trimmed === 'skip') return 'skip'

  const tokens = trimmed.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return 'all'

  const indices: number[] = []
  for (const token of tokens) {
    const n = parseInt(token, 10)
    if (!Number.isFinite(n) || n < 1 || n > count) return 'all'
    const idx = n - 1
    if (!indices.includes(idx)) indices.push(idx)
  }
  return indices.length > 0 ? indices : 'all'
}

export async function confirmProjectSelection(
  ranked: ScoredProject[],
  now: Date,
): Promise<ScoredProject[]> {
  if (ranked.length === 0) return ranked

  const matrixCreds = matrixConfigFromEnv()
  if (!matrixCreds) return ranked

  const schedulerConfig = loadMatrixSchedulerConfig()
  if (!schedulerConfig) return ranked

  const entries = ranked.map((r) => ({ project: r.project.id, agentId: r.agentId }))
  const msg = formatConfirmMessage(
    entries,
    now,
    schedulerConfig.timeout_min,
    schedulerConfig.on_timeout,
  )

  await sendMatrixMessage(matrixCreds, msg)

  const timeoutMs = schedulerConfig.timeout_min * 60 * 1_000

  const isConfirmReply = (m: MatrixMessage): boolean => {
    const b = m.body.trim().toLowerCase()
    return b === 'all' || b === 'skip' || /^\d[\d\s]*$/.test(b)
  }

  const reply = await waitForReply(
    matrixCreds.roomId,
    matrixCreds.accessToken,
    matrixCreds.homeserver,
    isConfirmReply,
    timeoutMs,
    { pollIntervalMs: schedulerConfig.poll_interval_ms },
  )

  if (reply === null) {
    return schedulerConfig.on_timeout === 'skip' ? [] : ranked
  }

  const selection = parseConfirmResponse(reply.body, ranked.length)
  if (selection === 'all') return ranked
  if (selection === 'skip') return []
  return selection.map((i) => ranked[i]).filter((r): r is ScoredProject => r !== undefined)
}
