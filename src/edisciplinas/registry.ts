import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, stat, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { homedir } from 'node:os'
import { parseFrontmatter } from '../vault/frontmatter.js'

export interface RegistryItem {
  url_hash: string
  content_hash: string | null
  filename: string
  url: string
  section: string
  downloaded_at: string
  last_seen: string
  local_path: string | null
  processed: boolean
  notes: string
}

export interface Registry {
  version: number
  discipline_id: string
  last_synced: string | null
  items: RegistryItem[]
}

export interface SyncStats {
  new: number
  updated: number
  missing: number
  total: number
  message?: string
}

export interface UnprocessedItem extends RegistryItem {
  priority: '🔴 Alta' | '🟡 Média' | '🔵 Revisão'
}

interface MetaItem {
  url_hash: string
  url: string
  filename: string
  section: string
}

interface Metadata {
  course_url?: string
  discipline_id?: string
  items: MetaItem[]
}

async function findProjectDir(vaultPath: string, disciplineId: string): Promise<string> {
  const projectDir = join(vaultPath, '10_Projects', disciplineId)
  await mkdir(projectDir, { recursive: true })
  return projectDir
}

async function computeFileHash(filePath: string): Promise<string> {
  const content = await readFile(filePath)
  return createHash('sha256').update(content).digest('hex')
}

async function loadMetadata(downloadsDir: string, assetsDir?: string): Promise<Metadata | null> {
  const dirs = assetsDir !== undefined ? [downloadsDir, assetsDir] : [downloadsDir]
  for (const dir of dirs) {
    try {
      const content = await readFile(join(dir, '_edisciplinas_metadata.json'), 'utf8')
      return JSON.parse(content) as Metadata
    } catch {
      /* not found */
    }
  }
  return null
}

export async function loadRegistry(projectDir: string): Promise<Registry> {
  try {
    const content = await readFile(join(projectDir, '.edisciplinas.json'), 'utf8')
    return JSON.parse(content) as Registry
  } catch {
    return { version: 1, discipline_id: '', last_synced: null, items: [] }
  }
}

async function saveRegistry(projectDir: string, registry: Registry): Promise<void> {
  await writeFile(join(projectDir, '.edisciplinas.json'), JSON.stringify(registry, null, 2), 'utf8')
}

async function walkFiles(dir: string): Promise<string[]> {
  const files: string[] = []
  async function recurse(current: string): Promise<void> {
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isFile()) files.push(full)
      else if (entry.isDirectory()) await recurse(full)
    }
  }
  await recurse(dir)
  return files
}

async function assignLocalPath(
  item: RegistryItem,
  assetsDir: string,
  projectDir: string,
): Promise<void> {
  let files: string[]
  try {
    files = await walkFiles(assetsDir)
  } catch {
    return
  }
  for (const filePath of files) {
    const name = filePath.slice(filePath.lastIndexOf('/') + 1)
    if (name === item.filename) {
      item.content_hash = await computeFileHash(filePath)
      item.local_path = relative(projectDir, filePath)
      return
    }
  }
}

export async function syncAssets(
  disciplineId: string,
  vaultPath: string,
  downloadsDir?: string,
): Promise<SyncStats> {
  const downloads = downloadsDir ?? homedir() + '/Downloads'
  const projectDir = await findProjectDir(vaultPath, disciplineId)
  const assetsDir = join(projectDir, 'assets')

  let assetsDirExists = false
  try {
    await stat(assetsDir)
    assetsDirExists = true
  } catch {
    /* not exists */
  }

  const metadata = await loadMetadata(downloads, assetsDirExists ? assetsDir : undefined)
  if (!metadata) {
    return { new: 0, updated: 0, missing: 0, total: 0, message: 'No metadata found in Downloads' }
  }

  const registry = await loadRegistry(projectDir)
  registry.discipline_id = disciplineId
  registry.last_synced = new Date().toISOString()

  const existingByHash: Record<string, RegistryItem> = {}
  for (const item of registry.items) existingByHash[item.url_hash] = item

  const filesByContentHash: Record<string, string> = {}
  if (assetsDirExists) {
    for (const filePath of await walkFiles(assetsDir)) {
      filesByContentHash[await computeFileHash(filePath)] = relative(projectDir, filePath)
    }
  }

  const stats: SyncStats = { new: 0, updated: 0, missing: 0, total: metadata.items.length }
  const newItems: RegistryItem[] = []

  for (const metaItem of metadata.items) {
    const existing = existingByHash[metaItem.url_hash]

    if (existing !== undefined) {
      existing.last_seen = new Date().toISOString()

      if (existing.content_hash !== null) {
        const newPath = filesByContentHash[existing.content_hash]
        if (newPath !== undefined) {
          if (existing.local_path !== newPath) {
            existing.local_path = newPath
            stats.updated++
          }
        } else {
          existing.local_path = null
          stats.missing++
        }
      } else {
        await assignLocalPath(existing, assetsDir, projectDir)
      }
      newItems.push(existing)
    } else {
      const item: RegistryItem = {
        url_hash: metaItem.url_hash,
        content_hash: null,
        filename: metaItem.filename,
        url: metaItem.url,
        section: metaItem.section,
        downloaded_at: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        local_path: null,
        processed: false,
        notes: '',
      }
      if (assetsDirExists) await assignLocalPath(item, assetsDir, projectDir)
      newItems.push(item)
      stats.new++
    }
  }

  registry.items = newItems
  await saveRegistry(projectDir, registry)
  return stats
}

export async function markProcessed(
  disciplineId: string,
  urlHash: string,
  vaultPath: string,
): Promise<boolean> {
  const projectDir = await findProjectDir(vaultPath, disciplineId)
  const registry = await loadRegistry(projectDir)
  const item = registry.items.find((i) => i.url_hash === urlHash)
  if (!item) return false
  item.processed = true
  await saveRegistry(projectDir, registry)
  return true
}

export async function resolveDisciplineFromMetadata(
  metadataPath: string,
  vaultPath: string,
): Promise<string | null> {
  let raw: string
  try {
    raw = await readFile(metadataPath, 'utf8')
  } catch {
    return null
  }

  let meta: Metadata
  try {
    meta = JSON.parse(raw) as Metadata
  } catch {
    return null
  }

  // Fast path: discipline_id is already embedded in the metadata
  if (typeof meta.discipline_id === 'string' && /^[A-Z]{3}\d{4}/.test(meta.discipline_id)) {
    return meta.discipline_id
  }

  // Slow path: match course_url against vault project frontmatter
  if (typeof meta.course_url === 'string') {
    const projectsDir = join(vaultPath, '10_Projects')
    let entries: string[]
    try {
      entries = await readdir(projectsDir)
    } catch {
      return null
    }
    for (const entry of entries) {
      const projectFile = join(projectsDir, entry, `${entry}.md`)
      try {
        const content = await readFile(projectFile, 'utf8')
        const { data } = parseFrontmatter(content)
        const edisciplinas = data['edisciplinas']
        if (typeof edisciplinas === 'string' && edisciplinas.includes(meta.course_url)) {
          return entry
        }
      } catch {
        /* skip unreadable projects */
      }
    }
  }

  return null
}

export async function syncAllRegistries(
  vaultPath: string,
  downloadsDir?: string,
): Promise<Record<string, SyncStats>> {
  const projectsDir = join(vaultPath, '10_Projects')
  let entries: string[]
  try {
    entries = await readdir(projectsDir)
  } catch {
    return {}
  }

  const results: Record<string, SyncStats> = {}
  for (const entry of entries) {
    const registryPath = join(projectsDir, entry, '.edisciplinas.json')
    try {
      await stat(registryPath)
    } catch {
      continue
    }
    results[entry] = await syncAssets(entry, vaultPath, downloadsDir)
  }
  return results
}

export async function listUnprocessed(
  disciplineId: string,
  vaultPath: string,
): Promise<UnprocessedItem[]> {
  const projectDir = await findProjectDir(vaultPath, disciplineId)
  const registry = await loadRegistry(projectDir)

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const alta: RegistryItem[] = []
  const media: RegistryItem[] = []

  for (const item of registry.items) {
    if (item.processed) continue
    const lastSeen = new Date(item.last_seen || item.downloaded_at)
    if (isNaN(lastSeen.getTime()) || lastSeen < weekAgo) {
      media.push(item)
    } else {
      alta.push(item)
    }
  }

  const result: UnprocessedItem[] = []
  for (const item of alta) result.push({ ...item, priority: '🔴 Alta' })
  for (const item of media) result.push({ ...item, priority: '🟡 Média' })
  return result
}
