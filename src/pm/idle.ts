import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface IdleStatus {
  idle: boolean
  lastActivityMs: number // ms since last Claude Code assistant response
  source: 'session-jsonl' | 'daemon' | 'unknown'
}

async function findLatestAssistantTimestamp(projectsDir: string): Promise<number> {
  let entries: string[]
  try {
    entries = (await readdir(projectsDir, { recursive: true })) as string[]
  } catch {
    return 0
  }

  let latest = 0
  const jsonlFiles = entries.filter((e) => e.endsWith('.jsonl'))

  for (const rel of jsonlFiles) {
    let content: string
    try {
      content = await readFile(join(projectsDir, rel), 'utf8')
    } catch {
      continue
    }
    for (const line of content.split('\n')) {
      if (!line.trim()) continue
      try {
        const obj = JSON.parse(line) as Record<string, unknown>
        if (obj['type'] === 'assistant' && typeof obj['timestamp'] === 'string') {
          const ts = new Date(obj['timestamp'] as string).getTime()
          if (!isNaN(ts) && ts > latest) latest = ts
        }
      } catch {
        // malformed line — skip
      }
    }
  }
  return latest
}

async function isDaemonActive(claudeHome: string): Promise<boolean> {
  let content: string
  try {
    content = await readFile(join(claudeHome, 'daemon.status.json'), 'utf8')
  } catch {
    return false
  }
  try {
    const status = JSON.parse(content) as Record<string, unknown>
    return Array.isArray(status['workers']) && (status['workers'] as unknown[]).length > 0
  } catch {
    return false
  }
}

export async function isClaudeCodeIdle(thresholdMinutes = 15): Promise<IdleStatus> {
  const claudeHome = join(homedir(), '.claude')
  const now = Date.now()
  const thresholdMs = thresholdMinutes * 60_000

  const lastActivity = await findLatestAssistantTimestamp(join(claudeHome, 'projects'))
  if (lastActivity > 0) {
    const elapsed = now - lastActivity
    return {
      idle: elapsed > thresholdMs,
      lastActivityMs: elapsed,
      source: 'session-jsonl',
    }
  }

  if (await isDaemonActive(claudeHome)) {
    return { idle: false, lastActivityMs: 0, source: 'daemon' }
  }

  return { idle: true, lastActivityMs: Infinity, source: 'unknown' }
}
