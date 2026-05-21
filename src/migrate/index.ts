import { basename } from 'node:path'
import { spawn } from 'node:child_process'
import { scanArchive } from './scan.js'
import { buildMigratePrompt } from './prompt.js'
import { promote } from './promote.js'
import type { MigrationDraft, MigrationResult } from './types.js'

export type { MigrationDraft, MigrationResult }

export interface MigrateOptions {
  dryRun?: boolean
  noTasks?: boolean
  timeoutMs?: number
  overrideId?: string
}

function extractJson(output: string): MigrationDraft {
  const match = output.match(/```json\s*([\s\S]*?)```/)
  if (!match?.[1]) {
    throw new Error('Claude did not return a JSON block.\nOutput:\n' + output.slice(0, 600))
  }
  try {
    return JSON.parse(match[1]) as MigrationDraft
  } catch (e) {
    throw new Error(`Failed to parse Claude JSON: ${e}\nRaw:\n${match[1].slice(0, 500)}`)
  }
}

function callClaude(prompt: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['--print', '--permission-mode', 'default'], {
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
      else reject(new Error(`claude exited ${code}: ${stderr.slice(0, 300)}`))
    })

    proc.on('error', reject)
    proc.stdin.write(prompt)
    proc.stdin.end()
  })
}

export async function migrate(
  archivePath: string,
  projectsDir: string,
  opts: MigrateOptions = {},
): Promise<{ result: MigrationResult; prompt: string }> {
  const timeoutMs = opts.timeoutMs ?? 120_000
  const suggestedId = opts.overrideId ?? basename(archivePath).toLowerCase().replace(/[\s_]+/g, '-')

  const notes = await scanArchive(archivePath)
  if (notes.length === 0) {
    throw new Error(`No .md files found in: ${archivePath}`)
  }

  const prompt = buildMigratePrompt(notes, suggestedId)

  if (opts.dryRun) {
    return {
      prompt,
      result: {
        projectPath: `${projectsDir}/${suggestedId}/${suggestedId}.md`,
        tasksCreated: [],
      },
    }
  }

  const output = await callClaude(prompt, timeoutMs)
  const draft = extractJson(output)

  if (opts.overrideId) {
    draft.id = opts.overrideId
  }

  const result = await promote(draft, projectsDir, { ...(opts.noTasks ? { noTasks: true } : {}) })
  return { result, prompt }
}

export { buildMigratePrompt, scanArchive }
