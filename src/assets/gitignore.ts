import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export async function addToGitignore(dir: string, patterns: string[]): Promise<void> {
  const path = join(dir, '.gitignore')
  const existing = existsSync(path) ? await readFile(path, 'utf8') : ''
  const lines = existing.split('\n').map(l => l.trim())
  const toAdd = patterns.filter(p => !lines.includes(p))
  if (toAdd.length === 0) return
  const separator = existing && !existing.endsWith('\n') ? '\n' : ''
  await writeFile(path, existing + separator + toAdd.join('\n') + '\n', 'utf8')
}
