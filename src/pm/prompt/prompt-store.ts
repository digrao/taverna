import {
  writeFileSync,
  readFileSync,
  readdirSync,
  mkdirSync,
  existsSync,
  unlinkSync,
} from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface PromptSnapshot {
  ts: string
  project: string
  agent: string
  mode: string
  char_total: number
  task_count: number
  prompt: string
}

const MAX_SNAPSHOTS = 10

function snapshotDir(project: string): string {
  const dir = join(homedir(), '.cache', 'taverna', 'prompts', project)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function savePromptSnapshot(snapshot: PromptSnapshot): void {
  const dir = snapshotDir(snapshot.project)
  const slug = snapshot.ts.replace(/[:.]/g, '-')
  writeFileSync(join(dir, `${slug}-${snapshot.agent}.json`), JSON.stringify(snapshot, null, 2))

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
  if (files.length > MAX_SNAPSHOTS) {
    files.slice(0, files.length - MAX_SNAPSHOTS).forEach((f) => {
      try {
        unlinkSync(join(dir, f))
      } catch {
        /* non-fatal */
      }
    })
  }
}

export function listPromptHistory(project: string): Omit<PromptSnapshot, 'prompt'>[] {
  const dir = snapshotDir(project)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, MAX_SNAPSHOTS)
    .flatMap((f) => {
      try {
        const s = JSON.parse(readFileSync(join(dir, f), 'utf8')) as PromptSnapshot
        const { prompt: _p, ...rest } = s
        return [rest]
      } catch {
        return []
      }
    })
}

export function getPromptSnapshot(project: string, ts: string): PromptSnapshot | null {
  const dir = snapshotDir(project)
  if (!existsSync(dir)) return null
  const file = readdirSync(dir).find((f) => f.endsWith('.json') && f.startsWith(ts))
  if (!file) return null
  try {
    return JSON.parse(readFileSync(join(dir, file), 'utf8')) as PromptSnapshot
  } catch {
    return null
  }
}

export function diffPromptTexts(a: string, b: string): string {
  const linesA = a.split('\n')
  const linesB = b.split('\n')
  const result: string[] = []
  const maxLen = Math.max(linesA.length, linesB.length)
  for (let i = 0; i < maxLen; i++) {
    const la = linesA.at(i)
    const lb = linesB.at(i)
    if (la === lb) {
      if (la !== undefined) result.push(` ${la}`)
    } else {
      if (la !== undefined) result.push(`-${la}`)
      if (lb !== undefined) result.push(`+${lb}`)
    }
  }
  return result.join('\n')
}
