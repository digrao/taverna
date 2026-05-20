import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, relative, basename } from 'node:path'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { sha256File } from './hash.js'
import { formatPointer, DEFAULT_ASSET_EXTENSIONS } from './pointer.core.js'
import { addToGitignore } from './gitignore.js'

export { DEFAULT_ASSET_EXTENSIONS }

const execFileAsync = promisify(execFile)

export interface StoreOptions {
  vaultPath: string
  extensions?: string[]
  copypartyUrl?: string
  gdriveRemote?: string
  gdriveBasePath?: string
  dryRun?: boolean
  fetch?: typeof globalThis.fetch
}

export interface StoreResult {
  stored: string[]
  skipped: string[]
  errors: Array<{ file: string; error: string }>
}

// copyparty temp file pattern: name-{float}-{random}.ext (e.g. file.pdf-1234567.89-wO_abc.pdf)
const COPYPARTY_TEMP = /\-\d+\.\d+\-\w+\.\w+$/

async function findHeavyFiles(dir: string, extensions: Set<string>): Promise<string[]> {
  const result: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    if (COPYPARTY_TEMP.test(e.name)) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      result.push(...(await findHeavyFiles(full, extensions)))
    } else if (e.isFile() && !e.name.endsWith('.asset')) {
      const ext = e.name.split('.').pop()?.toLowerCase() ?? ''
      if (extensions.has(ext)) result.push(full)
    }
  }
  return result
}

function toUrl(base: string, relPath: string): string {
  const encoded = relPath.split('/').map(encodeURIComponent).join('/')
  return `${base.replace(/\/$/, '')}/${encoded}`
}

// Returns { cleanBase, authHeader } — strips user:pass from URL so .asset stores clean URL
function parseCopypartyUrl(rawUrl: string): { cleanBase: string; authHeader?: string } {
  const u = new URL(rawUrl)
  if (!u.username) return { cleanBase: rawUrl }
  const authHeader = 'Basic ' + Buffer.from(`${u.username}:${u.password}`).toString('base64')
  u.username = ''
  u.password = ''
  return { cleanBase: u.toString(), authHeader }
}

async function uploadCopyparty(
  filePath: string,
  url: string,
  authHeader: string | undefined,
  fetchFn: typeof globalThis.fetch,
): Promise<void> {
  const buf = await readFile(filePath)
  const headers: Record<string, string> = {}
  if (authHeader) headers['Authorization'] = authHeader
  const res = await fetchFn(url, { method: 'PUT', body: buf, headers })
  if (!res.ok) throw new Error(`copyparty PUT failed HTTP ${res.status}: ${url}`)
}

async function uploadGdrive(filePath: string, remoteDir: string, remote: string): Promise<string> {
  await execFileAsync('rclone', ['copy', filePath, `${remote}:${remoteDir}`])
  const { stdout } = await execFileAsync('rclone', ['lsjson', `${remote}:${remoteDir}`, '--files-only'])
  const files = JSON.parse(stdout) as Array<{ Name: string; ID: string }>
  const name = basename(filePath)
  const entry = files.find(f => f.Name === name)
  if (!entry?.ID) throw new Error(`rclone: ${name} not found after upload to ${remote}:${remoteDir}`)
  return entry.ID
}

export async function storeAssets(assetsDir: string, opts: StoreOptions): Promise<StoreResult> {
  const extensions = new Set(opts.extensions ?? DEFAULT_ASSET_EXTENSIONS)
  const fetchFn = opts.fetch ?? globalThis.fetch
  const result: StoreResult = { stored: [], skipped: [], errors: [] }

  if (!existsSync(assetsDir)) return result

  const heavyFiles = await findHeavyFiles(assetsDir, extensions)

  for (const filePath of heavyFiles) {
    const pointerPath = `${filePath}.asset`
    if (existsSync(pointerPath)) {
      result.skipped.push(filePath)
      continue
    }

    if (opts.dryRun) {
      result.stored.push(filePath)
      continue
    }

    try {
      const [sha256, s] = await Promise.all([sha256File(filePath), stat(filePath)])
      const relPath = relative(opts.vaultPath, filePath)
      const relDir = relative(opts.vaultPath, join(assetsDir, relative(assetsDir, filePath), '..'))

      let copyparty: string | undefined
      let gdrive: string | undefined

      if (opts.copypartyUrl) {
        const { cleanBase, authHeader } = parseCopypartyUrl(opts.copypartyUrl)
        copyparty = toUrl(cleanBase, relPath)
        await uploadCopyparty(filePath, copyparty, authHeader, fetchFn)
      }

      if (opts.gdriveRemote && opts.gdriveBasePath) {
        const remoteDir = `${opts.gdriveBasePath}/${relDir}`
        gdrive = await uploadGdrive(filePath, remoteDir, opts.gdriveRemote)
      }

      await writeFile(
        pointerPath,
        formatPointer({
          name: basename(filePath),
          sha256,
          size: s.size,
          ...(copyparty !== undefined ? { copyparty } : {}),
          ...(gdrive !== undefined ? { gdrive } : {}),
        }),
        'utf8',
      )
      result.stored.push(filePath)
    } catch (e) {
      result.errors.push({ file: filePath, error: String(e) })
    }
  }

  if (!opts.dryRun && result.stored.length > 0) {
    await addToGitignore(assetsDir, [...extensions].map(ext => `*.${ext}`))
  }

  return result
}
