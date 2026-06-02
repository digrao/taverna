import { join } from 'node:path'
import { spawn } from 'node:child_process'
import {
  selectBatch,
  buildPrompt,
  parseClassifications,
  addRelevancia,
  moveToArchive,
} from '../../vault/inbox/process.js'
import type { TavernaConfig } from '../../config.js'
import type { InboxWorkItem } from './types.js'

export interface DispatchResult {
  processed: number
  skipped: number
  errors: Array<{ file: string; error: string }>
  dryRun?: { file: string; cluster: string; relevancia: number }[]
}

const TIMEOUT_MS = 120_000

function spawnClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['--print', '--permission-mode', 'bypassPermissions'], {
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
      reject(new Error(`claude timed out after ${TIMEOUT_MS}ms`))
    }, TIMEOUT_MS)
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(stdout)
      else reject(new Error(`claude exited ${code}: ${stderr.slice(0, 200)}`))
    })
    proc.on('error', reject)
    proc.stdin.write(prompt)
    proc.stdin.end()
  })
}

/**
 * Dispatch an inbox WorkItem to Claude for classification.
 * Calls triage BEFORE reaching here — this function only runs items that passed triage.
 */
export async function dispatchInbox(
  item: InboxWorkItem,
  config: TavernaConfig,
  opts: { dryRun?: boolean } = {},
): Promise<DispatchResult> {
  const archiveDir = join(config.vaultPath, '40_Archives', 'projetos-incompletos')
  const result: DispatchResult = { processed: 0, skipped: 0, errors: [] }

  const batch = selectBatch(item.files, item.maxChars)
  result.skipped = item.files.length - batch.length

  if (opts.dryRun) {
    const prompt = buildPrompt(item.directiveText, batch)
    console.log(
      `--- INBOX DRY RUN (${prompt.length} chars, ${batch.length} files) ---\n${prompt}\n---`,
    )
    result.dryRun = batch.map((f) => ({ file: f.filename, cluster: 'dry-run', relevancia: 0 }))
    return result
  }

  const prompt = buildPrompt(item.directiveText, batch)
  let output: string
  try {
    output = await spawnClaude(prompt)
  } catch (e) {
    result.errors.push({ file: '(batch)', error: String(e) })
    return result
  }

  let classifications
  try {
    classifications = parseClassifications(output)
  } catch (e) {
    result.errors.push({
      file: '(parse)',
      error: `${String(e)}\nRaw output:\n${output.slice(0, 500)}`,
    })
    return result
  }

  const classMap = new Map(classifications.map((c) => [c.file, c]))
  for (const f of batch) {
    const cls = classMap.get(f.filename)
    if (!cls) {
      result.errors.push({ file: f.filename, error: 'no classification returned by agent' })
      continue
    }
    try {
      await addRelevancia(f.filePath, cls.relevancia)
      await moveToArchive(f.filePath, archiveDir, cls.cluster)
      result.processed++
    } catch (e) {
      result.errors.push({ file: f.filename, error: String(e) })
    }
  }

  return result
}
