import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { existsSync } from 'node:fs'

const WIKILINK_RE = /\[\[([^\]|#]+?)(?:[|#][^\]]*)?\]\]/g
const MDLINK_RE = /\[(?:[^\]]*)\]\(([^)]+)\)/g

async function walkMd(dir: string, files: string[] = []): Promise<string[]> {
  if (!existsSync(dir)) return files
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) await walkMd(full, files)
    else if (entry.name.endsWith('.md')) files.push(full)
  }
  return files
}

function stemOf(filePath: string): string {
  return filePath.replace(/\.md$/, '').split('/').pop() ?? ''
}

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split('\n').length
}

export interface Backlink {
  source: string
  line: number
}

export async function findBacklinks(vaultPath: string, notePath: string): Promise<Backlink[]> {
  const noteStem = stemOf(notePath)
  const noteRelative = relative(vaultPath, notePath)

  const all = await walkMd(vaultPath)
  const results: Backlink[] = []

  for (const file of all) {
    if (file === notePath) continue
    const content = await readFile(file, 'utf8').catch(() => '')
    const source = relative(vaultPath, file)

    for (const m of content.matchAll(WIKILINK_RE)) {
      const target = m[1]!.trim()
      if (target === noteStem || target === noteRelative || target.endsWith('/' + noteStem)) {
        results.push({ source, line: lineOf(content, m.index) })
      }
    }

    for (const m of content.matchAll(MDLINK_RE)) {
      const target = decodeURIComponent(m[1]!.trim()).replace(/\.md$/, '')
      if (target === noteStem || target.endsWith('/' + noteStem)) {
        results.push({ source, line: lineOf(content, m.index) })
      }
    }
  }

  return results.sort((a, b) => a.source.localeCompare(b.source) || a.line - b.line)
}
