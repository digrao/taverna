import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { parseFrontmatter } from '../frontmatter.js'
import type { ArchiveNote } from './types.js'

export async function scanArchive(archivePath: string): Promise<ArchiveNote[]> {
  if (!existsSync(archivePath)) {
    throw new Error(`Archive path not found: ${archivePath}`)
  }

  const s = await stat(archivePath)

  if (s.isFile() && archivePath.endsWith('.md')) {
    return [await readNote(archivePath)]
  }

  if (s.isDirectory()) {
    const entries = await readdir(archivePath)
    const notes: ArchiveNote[] = []
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue
      const filePath = join(archivePath, entry)
      const fs = await stat(filePath).catch(() => null)
      if (fs?.isFile()) {
        notes.push(await readNote(filePath))
      }
    }
    return notes
  }

  return []
}

async function readNote(filePath: string): Promise<ArchiveNote> {
  const raw = await readFile(filePath, 'utf8')
  const { data, content } = parseFrontmatter(raw)
  return {
    filename: filePath.split('/').pop() ?? filePath,
    body: content.trim(),
    frontmatter: data,
  }
}
