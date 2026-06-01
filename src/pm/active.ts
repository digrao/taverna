import {
  writeFileSync,
  unlinkSync,
  readdirSync,
  readFileSync,
  mkdirSync,
  existsSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const DIR = join(tmpdir(), 'taverna-active')

export interface ActiveRun {
  project: string
  agent: string
  sessionId: string
  startedAt: string
  tmuxSession?: string
  logFile?: string
}

function ensureDir(): void {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true })
}

export function markActive(run: ActiveRun): void {
  ensureDir()
  writeFileSync(join(DIR, `${run.project}.json`), JSON.stringify(run))
}

export function markInactive(project: string): void {
  try {
    unlinkSync(join(DIR, `${project}.json`))
  } catch {
    /* already gone */
  }
}

export function getActiveRuns(): ActiveRun[] {
  ensureDir()
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => {
      try {
        return [JSON.parse(readFileSync(join(DIR, f), 'utf8')) as ActiveRun]
      } catch {
        return []
      }
    })
}

export function activeDir(): string {
  ensureDir()
  return DIR
}
