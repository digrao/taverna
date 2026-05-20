import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { sha256File } from './hash.js'
import { parsePointer, DEFAULT_ASSET_EXTENSIONS } from './pointer.core.js'
import type { AssetPointer } from './pointer.core.js'

export type AssetState = 'ok' | 'missing' | 'modified' | 'no-pointer'

export interface AssetFileStatus {
  relativePath: string
  state: AssetState
  size?: number
  pointer?: AssetPointer
}

async function walk(
  dir: string,
  base: string,
  extensions: Set<string>,
  out: AssetFileStatus[],
): Promise<void> {
  if (!existsSync(dir)) return
  const entries = await readdir(dir, { withFileTypes: true })

  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const full = join(dir, e.name)
    const rel = full.slice(base.length + 1)

    if (e.isDirectory()) {
      await walk(full, base, extensions, out)
      continue
    }
    if (!e.isFile()) continue

    if (e.name.endsWith('.asset')) {
      const realPath = full.slice(0, -'.asset'.length)
      const realRel = rel.slice(0, -'.asset'.length)
      try {
        const pointer = parsePointer(await readFile(full, 'utf8'))
        if (!existsSync(realPath)) {
          out.push({ relativePath: realRel, state: 'missing', size: pointer.size, pointer })
        } else {
          const localHash = await sha256File(realPath)
          const s = await stat(realPath)
          out.push({
            relativePath: realRel,
            state: localHash === pointer.sha256 ? 'ok' : 'modified',
            size: s.size,
            pointer,
          })
        }
      } catch {
        out.push({ relativePath: realRel, state: 'missing' })
      }
      continue
    }

    const ext = e.name.split('.').pop()?.toLowerCase() ?? ''
    if (extensions.has(ext) && !existsSync(`${full}.asset`)) {
      const s = await stat(full)
      out.push({ relativePath: rel, state: 'no-pointer', size: s.size })
    }
  }
}

export async function statusAssets(
  assetsDir: string,
  extensions?: string[],
): Promise<AssetFileStatus[]> {
  const exts = new Set(extensions ?? DEFAULT_ASSET_EXTENSIONS)
  const out: AssetFileStatus[] = []
  await walk(assetsDir, assetsDir, exts, out)
  return out.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}
