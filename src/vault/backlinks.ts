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

export interface BacklinkResult {
  source: string
  sourceRelative: string
}

export async function findBacklinks(
  vaultPath: string,
  notePath: string,
): Promise<BacklinkResult[]> {
  const noteStem = stemOf(notePath)
  const noteRelative = relative(vaultPath, notePath)

  const all = await walkMd(vaultPath)
  const results: BacklinkResult[] = []

  for (const file of all) {
    if (file === notePath) continue
    const content = await readFile(file, 'utf8').catch(() => '')

    let found = false

    for (const m of content.matchAll(WIKILINK_RE)) {
      const target = m[1]!.trim()
      if (target === noteStem || target === noteRelative || target.endsWith('/' + noteStem)) {
        found = true
        break
      }
    }

    if (!found) {
      for (const m of content.matchAll(MDLINK_RE)) {
        const target = decodeURIComponent(m[1]!.trim()).replace(/\.md$/, '')
        if (target === noteStem || target.endsWith('/' + noteStem)) {
          found = true
          break
        }
      }
    }

    if (found) results.push({ source: file, sourceRelative: relative(vaultPath, file) })
  }

  return results.sort((a, b) => a.sourceRelative.localeCompare(b.sourceRelative))
}
