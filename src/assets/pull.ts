import { readdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { sha256File } from './hash.js'
import { parsePointer } from './pointer.js'
import type { AssetPointer } from './pointer.js'

export interface PullOptions {
  dryRun?: boolean
  fetch?: typeof globalThis.fetch
}

export interface PullResult {
  downloaded: string[]
  skipped: string[]
  errors: Array<{ file: string; error: string }>
}

async function findPointerFiles(dir: string): Promise<string[]> {
  const result: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      result.push(...(await findPointerFiles(full)))
    } else if (e.isFile() && e.name.endsWith('.asset')) {
      result.push(full)
    }
  }
  return result
}

async function downloadFile(
  pointer: AssetPointer,
  destPath: string,
  fetchFn: typeof globalThis.fetch,
): Promise<void> {
  if (!pointer.copyparty) {
    throw new Error(
      `No copyparty URL in pointer for ${pointer.name} — use the Obsidian plugin for GDrive download`,
    )
  }
  const res = await fetchFn(pointer.copyparty)
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${pointer.copyparty}`)

  const buf = await res.arrayBuffer()
  await writeFile(destPath, Buffer.from(buf))

  const actualHash = await sha256File(destPath)
  if (actualHash !== pointer.sha256) {
    await unlink(destPath)
    throw new Error(
      `SHA-256 mismatch for ${pointer.name}: expected ${pointer.sha256.slice(0, 8)}… got ${actualHash.slice(0, 8)}…`,
    )
  }
}

export async function pullAssets(assetsDir: string, opts?: PullOptions): Promise<PullResult> {
  const fetchFn = opts?.fetch ?? globalThis.fetch
  const result: PullResult = { downloaded: [], skipped: [], errors: [] }

  if (!existsSync(assetsDir)) return result

  const pointerFiles = await findPointerFiles(assetsDir)

  for (const pointerPath of pointerFiles) {
    const realPath = pointerPath.slice(0, -'.asset'.length)

    try {
      const pointer = parsePointer(await readFile(pointerPath, 'utf8'))

      if (existsSync(realPath)) {
        const localHash = await sha256File(realPath)
        if (localHash === pointer.sha256) {
          result.skipped.push(realPath)
          continue
        }
      }

      if (opts?.dryRun) {
        result.downloaded.push(realPath)
        continue
      }

      await downloadFile(pointer, realPath, fetchFn)
      result.downloaded.push(realPath)
    } catch (e) {
      result.errors.push({ file: realPath, error: String(e) })
    }
  }

  return result
}
