import { readdir, readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import matter from 'gray-matter'
import type { TavernaConfig } from '../config.js'

// 10% of a book ≈ 30 pages ≈ 15 000 chars
export const MAX_CHARS_PER_RUN = 15_000
const TIMEOUT_MS = 120_000

export interface InboxFile {
  filename: string
  filePath: string
  content: string
}

export interface Classification {
  file: string
  cluster: string
  relevancia: number
}

export interface ProcessResult {
  processed: number
  skipped: number
  errors: Array<{ file: string; error: string }>
  dryRun?: Classification[]
}

export async function scanInbox(inboxDir: string): Promise<InboxFile[]> {
  if (!existsSync(inboxDir)) return []
  const entries = await readdir(inboxDir, { withFileTypes: true })
  const files: InboxFile[] = []
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.md')) continue
    const filePath = join(inboxDir, e.name)
    const raw = await readFile(filePath, 'utf8')
    files.push({ filename: e.name, filePath, content: raw })
  }
  return files.sort((a, b) => a.filename.localeCompare(b.filename))
}

export function selectBatch(files: InboxFile[], maxChars: number): InboxFile[] {
  const batch: InboxFile[] = []
  let total = 0
  for (const f of files) {
    if (total + f.content.length > maxChars) break
    batch.push(f)
    total += f.content.length
  }
  return batch
}

export function buildPrompt(directiveText: string, batch: InboxFile[]): string {
  const items = batch
    .map(f => `### ${f.filename}\n${f.content.trim()}`)
    .join('\n\n---\n\n')

  return [
    directiveText.trim(),
    '',
    '## Notas para classificar',
    '',
    items,
  ].join('\n')
}

function spawnClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['--print', '--permission-mode', 'bypassPermissions'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error(`claude timed out after ${TIMEOUT_MS}ms`))
    }, TIMEOUT_MS)
    proc.on('close', code => {
      clearTimeout(timer)
      if (code === 0) resolve(stdout)
      else reject(new Error(`claude exited ${code}: ${stderr.slice(0, 200)}`))
    })
    proc.on('error', reject)
    proc.stdin.write(prompt)
    proc.stdin.end()
  })
}

export function parseClassifications(output: string): Classification[] {
  const match = output.match(/```json\s*([\s\S]*?)```/)
  if (!match?.[1]) {
    // Try bare JSON array
    const bare = output.match(/(\[\s*\{[\s\S]*?\}\s*\])/)
    if (!bare?.[1]) throw new Error('No JSON block found in agent output')
    return JSON.parse(bare[1]) as Classification[]
  }
  return JSON.parse(match[1]) as Classification[]
}

async function addRelevancia(filePath: string, relevancia: number): Promise<void> {
  const raw = await readFile(filePath, 'utf8')
  const parsed = matter(raw)
  parsed.data['relevancia'] = relevancia
  await writeFile(filePath, matter.stringify(parsed.content, parsed.data), 'utf8')
}

async function moveToArchive(
  filePath: string,
  archiveDir: string,
  cluster: string,
): Promise<void> {
  const destDir = join(archiveDir, cluster)
  await mkdir(destDir, { recursive: true })
  const dest = join(destDir, basename(filePath))
  await rename(filePath, dest)
}

export async function processInbox(
  config: TavernaConfig,
  opts: { dryRun?: boolean; maxChars?: number } = {},
): Promise<ProcessResult> {
  const inboxDir = join(config.vaultPath, '00_Inbox')
  const archiveDir = join(config.vaultPath, '40_Archives', 'projetos-incompletos')
  const directivesPath = join(
    config.vaultPath,
    config.directivesDir,
    'inbox-manager',
    'directives.md',
  )

  const result: ProcessResult = { processed: 0, skipped: 0, errors: [] }

  // Load directive
  if (!existsSync(directivesPath)) {
    throw new Error(`inbox-manager directive not found at ${directivesPath}`)
  }
  const directiveRaw = await readFile(directivesPath, 'utf8')
  const { content: directiveText } = matter(directiveRaw)

  // Scan and batch
  const all = await scanInbox(inboxDir)
  if (all.length === 0) {
    result.skipped = 0
    return result
  }

  const maxChars = opts.maxChars ?? MAX_CHARS_PER_RUN
  const batch = selectBatch(all, maxChars)
  result.skipped = all.length - batch.length

  if (opts.dryRun) {
    const prompt = buildPrompt(directiveText, batch)
    console.log(`--- PROMPT (${prompt.length} chars) ---\n${prompt}\n---`)
    result.dryRun = batch.map(f => ({ file: f.filename, cluster: 'dry-run', relevancia: 0 }))
    return result
  }

  // Call Claude
  const prompt = buildPrompt(directiveText, batch)
  let output: string
  try {
    output = await spawnClaude(prompt)
  } catch (e) {
    result.errors.push({ file: '(batch)', error: String(e) })
    return result
  }

  // Parse and apply
  let classifications: Classification[]
  try {
    classifications = parseClassifications(output)
  } catch (e) {
    result.errors.push({ file: '(parse)', error: `${String(e)}\nRaw output:\n${output.slice(0, 500)}` })
    return result
  }

  const classMap = new Map(classifications.map(c => [c.file, c]))

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
