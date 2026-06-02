import { readdir, readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { existsSync } from 'node:fs'
import matter from 'gray-matter'

// 10% of a book ≈ 30 pages ≈ 15 000 chars
export const MAX_CHARS_PER_RUN = 15_000

export interface InboxFile {
  filename: string
  filePath: string
  content: string
}

/** Lazy-loading inbox item: frontmatter always present, body loaded on demand. */
export interface InboxItem {
  path: string
  filename: string
  frontmatter: Record<string, unknown>
  body?: string
}

export interface Classification {
  file: string
  cluster: string
  relevancia: number
}

export async function loadFrontmatter(filePath: string): Promise<InboxItem> {
  const raw = await readFile(filePath, 'utf8')
  const parsed = matter(raw)
  return { path: filePath, filename: basename(filePath), frontmatter: parsed.data }
}

export async function loadBody(item: InboxItem): Promise<InboxItem> {
  if (item.body !== undefined) return item
  const raw = await readFile(item.path, 'utf8')
  const parsed = matter(raw)
  return { ...item, body: parsed.content }
}

function deriveCluster(fm: Record<string, unknown>): string | null {
  if (fm['status'] === 'done') return 'done'
  if (typeof fm['type'] === 'string' && typeof fm['projeto'] === 'string') return fm['type']
  if (typeof fm['projeto'] === 'string') return 'projetos'
  if (typeof fm['type'] === 'string') return fm['type']
  return null
}

export function canRouteByFrontmatter(fm: Record<string, unknown>): boolean {
  return deriveCluster(fm) !== null
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
  const items = batch.map((f) => `### ${f.filename}\n${f.content.trim()}`).join('\n\n---\n\n')

  return [directiveText.trim(), '', '## Notas para classificar', '', items].join('\n')
}

export function parseClassifications(output: string): Classification[] {
  const match = output.match(/```json\s*([\s\S]*?)```/)
  if (!match?.[1]) {
    const bare = output.match(/(\[\s*\{[\s\S]*?\}\s*\])/)
    if (!bare?.[1]) throw new Error('No JSON block found in agent output')
    return JSON.parse(bare[1]) as Classification[]
  }
  return JSON.parse(match[1]) as Classification[]
}

export async function addRelevancia(filePath: string, relevancia: number): Promise<void> {
  const raw = await readFile(filePath, 'utf8')
  const parsed = matter(raw)
  parsed.data['relevancia'] = relevancia
  await writeFile(filePath, matter.stringify(parsed.content, parsed.data), 'utf8')
}

export async function moveToArchive(
  filePath: string,
  archiveDir: string,
  cluster: string,
): Promise<void> {
  const destDir = join(archiveDir, cluster)
  await mkdir(destDir, { recursive: true })
  const dest = join(destDir, basename(filePath))
  await rename(filePath, dest)
}
