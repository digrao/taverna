import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { syncAssets, loadRegistry, listUnprocessed } from '../src/edisciplinas/registry.js'

function makeMetadata(disciplineId: string, items: MetaItem[]) {
  return { discipline_id: disciplineId, exported_at: new Date().toISOString(), items }
}

interface MetaItem {
  url_hash: string
  url: string
  xpath: string
  filename: string
  section: string
}

function makeMetaItem(urlHash: string, filename: string, section = 'Aula 1'): MetaItem {
  return {
    url_hash: urlHash,
    url: `https://edisciplinas.usp.br/${urlHash}`,
    xpath: `//a[@data-hash='${urlHash}']`,
    filename,
    section,
  }
}

async function writeMetadata(downloadsDir: string, disciplineId: string, items: MetaItem[]) {
  await writeFile(
    join(downloadsDir, '_edisciplinas_metadata.json'),
    JSON.stringify(makeMetadata(disciplineId, items)),
    'utf8',
  )
}

function itemFixture(urlHash: string, processed: boolean, lastSeenDaysAgo: number) {
  const lastSeen = new Date(Date.now() - lastSeenDaysAgo * 24 * 60 * 60 * 1000).toISOString()
  return {
    url_hash: urlHash,
    content_hash: null,
    filename: `${urlHash}.pdf`,
    url: `https://e.usp.br/${urlHash}`,
    section: 'Section',
    downloaded_at: lastSeen,
    last_seen: lastSeen,
    local_path: null,
    processed,
    notes: '',
  }
}

async function buildRegistry(projectDir: string, items: ReturnType<typeof itemFixture>[]) {
  await mkdir(projectDir, { recursive: true })
  const registry = {
    version: 1,
    discipline_id: 'PSI3451',
    last_synced: new Date().toISOString(),
    items,
  }
  await writeFile(join(projectDir, '.edisciplinas.json'), JSON.stringify(registry), 'utf8')
}

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'taverna-edis-'))
})
afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('syncAssets', () => {
  it('creates registry from metadata', async () => {
    const downloads = join(tmpDir, 'Downloads')
    const vault = join(tmpDir, 'vault')
    await mkdir(downloads)

    const items = [
      makeMetaItem('a1b2c3d4', 'Aula_01_VHDL.pdf', 'Aula 1'),
      makeMetaItem('e5f6a7b8', 'Exercicio_01.pdf', 'Exercicio 1'),
    ]
    await writeMetadata(downloads, 'PSI3451', items)

    const stats = await syncAssets('PSI3451', vault, downloads)

    expect(stats.new).toBe(2)
    expect(stats.updated).toBe(0)
    expect(stats.missing).toBe(0)
    expect(stats.total).toBe(2)

    const projectDir = join(vault, '10_Projects', 'PSI3451')
    const registry = await loadRegistry(projectDir)
    expect(registry.discipline_id).toBe('PSI3451')
    expect(registry.items).toHaveLength(2)

    const byHash = Object.fromEntries(registry.items.map((i) => [i.url_hash, i]))
    expect(byHash['a1b2c3d4']?.processed).toBe(false)
    expect(byHash['a1b2c3d4']?.filename).toBe('Aula_01_VHDL.pdf')
    expect(byHash['e5f6a7b8']?.section).toBe('Exercicio 1')
  })

  it('assigns local_path when file is already in assets/', async () => {
    const downloads = join(tmpDir, 'Downloads')
    const vault = join(tmpDir, 'vault')
    const assetsDir = join(vault, '10_Projects', 'PSI3451', 'assets')
    await mkdir(downloads)
    await mkdir(assetsDir, { recursive: true })
    await writeFile(join(assetsDir, 'Aula_01_VHDL.pdf'), Buffer.from('pdf content here'))

    await writeMetadata(downloads, 'PSI3451', [makeMetaItem('a1b2c3d4', 'Aula_01_VHDL.pdf')])
    await syncAssets('PSI3451', vault, downloads)

    const registry = await loadRegistry(join(vault, '10_Projects', 'PSI3451'))
    const item = registry.items[0]!
    expect(item.local_path).toBe('assets/Aula_01_VHDL.pdf')
    expect(item.content_hash).not.toBeNull()
    expect(item.processed).toBe(false)
  })

  it('detects moved file and updates local_path', async () => {
    const downloads = join(tmpDir, 'Downloads')
    const vault = join(tmpDir, 'vault')
    const projectDir = join(vault, '10_Projects', 'PSI3451')
    const assetsDir = join(projectDir, 'assets')
    await mkdir(downloads)
    await mkdir(assetsDir, { recursive: true })

    const pdf = join(assetsDir, 'Aula_01.pdf')
    await writeFile(pdf, Buffer.from('lecture content'))
    await writeMetadata(downloads, 'PSI3451', [makeMetaItem('aa11bb22', 'Aula_01.pdf')])
    await syncAssets('PSI3451', vault, downloads)

    // Mark as processed
    const reg = await loadRegistry(projectDir)
    reg.items[0]!.processed = true
    await writeFile(join(projectDir, '.edisciplinas.json'), JSON.stringify(reg), 'utf8')

    // Move file to subdirectory
    const subdir = join(assetsDir, 'aula_01')
    await mkdir(subdir)
    await rename(pdf, join(subdir, 'Aula_01.pdf'))

    const stats = await syncAssets('PSI3451', vault, downloads)
    expect(stats.updated).toBe(1)
    expect(stats.missing).toBe(0)

    const registry = await loadRegistry(projectDir)
    const item = registry.items[0]!
    expect(item.local_path).toBe('assets/aula_01/Aula_01.pdf')
    expect(item.processed).toBe(true)
  })

  it('marks missing when file is deleted', async () => {
    const downloads = join(tmpDir, 'Downloads')
    const vault = join(tmpDir, 'vault')
    const projectDir = join(vault, '10_Projects', 'PSI3451')
    const assetsDir = join(projectDir, 'assets')
    await mkdir(downloads)
    await mkdir(assetsDir, { recursive: true })

    const pdf = join(assetsDir, 'Aula_01.pdf')
    await writeFile(pdf, Buffer.from('data'))
    await writeMetadata(downloads, 'PSI3451', [makeMetaItem('cc33dd44', 'Aula_01.pdf')])
    await syncAssets('PSI3451', vault, downloads)

    const { unlink } = await import('node:fs/promises')
    await unlink(pdf)
    const stats = await syncAssets('PSI3451', vault, downloads)

    expect(stats.missing).toBe(1)
    const registry = await loadRegistry(projectDir)
    expect(registry.items[0]?.local_path).toBeNull()
  })

  it('does not duplicate items on re-sync', async () => {
    const downloads = join(tmpDir, 'Downloads')
    const vault = join(tmpDir, 'vault')
    await mkdir(downloads)

    await writeMetadata(downloads, 'PSI3451', [makeMetaItem('aa11', 'f.pdf')])
    await syncAssets('PSI3451', vault, downloads)
    await syncAssets('PSI3451', vault, downloads)

    const registry = await loadRegistry(join(vault, '10_Projects', 'PSI3451'))
    expect(registry.items).toHaveLength(1)
  })

  it('finds metadata in assets/ when absent from Downloads', async () => {
    const downloads = join(tmpDir, 'NoDownloads')
    const vault = join(tmpDir, 'vault')
    const assetsDir = join(vault, '10_Projects', 'PSI3451', 'assets')
    await mkdir(downloads)
    await mkdir(assetsDir, { recursive: true })

    const metadata = makeMetadata('PSI3451', [makeMetaItem('xx99', 'file.pdf')])
    await writeFile(
      join(assetsDir, '_edisciplinas_metadata.json'),
      JSON.stringify(metadata),
      'utf8',
    )

    const stats = await syncAssets('PSI3451', vault, downloads)
    expect(stats.new).toBe(1)
  })
})

describe('listUnprocessed', () => {
  it('sorts Alta before Média and excludes processed', async () => {
    const vault = join(tmpDir, 'vault')
    const projectDir = join(vault, '10_Projects', 'PSI3451')

    await buildRegistry(projectDir, [
      itemFixture('old_unprocessed', false, 10),
      itemFixture('new_unprocessed', false, 2),
      itemFixture('processed_recent', true, 1),
    ])

    const result = await listUnprocessed('PSI3451', vault)
    const unprocessed = result.filter((r) => !r.processed)
    expect(unprocessed).toHaveLength(2)

    const priorities = unprocessed.map((r) => r.priority)
    expect(priorities.indexOf('🔴 Alta')).toBeLessThan(priorities.indexOf('🟡 Média'))
  })

  it('assigns Alta for last_seen within 7 days', async () => {
    const vault = join(tmpDir, 'vault')
    const projectDir = join(vault, '10_Projects', 'PSI3451')
    await buildRegistry(projectDir, [itemFixture('h1', false, 3)])

    const result = await listUnprocessed('PSI3451', vault)
    expect(result).toHaveLength(1)
    expect(result[0]?.priority).toBe('🔴 Alta')
  })

  it('assigns Média for last_seen older than 7 days', async () => {
    const vault = join(tmpDir, 'vault')
    const projectDir = join(vault, '10_Projects', 'PSI3451')
    await buildRegistry(projectDir, [itemFixture('h2', false, 15)])

    const result = await listUnprocessed('PSI3451', vault)
    expect(result).toHaveLength(1)
    expect(result[0]?.priority).toBe('🟡 Média')
  })

  it('excludes processed items', async () => {
    const vault = join(tmpDir, 'vault')
    const projectDir = join(vault, '10_Projects', 'PSI3451')
    await buildRegistry(projectDir, [itemFixture('h3', true, 1)])

    const result = await listUnprocessed('PSI3451', vault)
    expect(result).toEqual([])
  })

  it('returns empty array for empty registry', async () => {
    const vault = join(tmpDir, 'vault')
    const projectDir = join(vault, '10_Projects', 'PSI3451')
    await buildRegistry(projectDir, [])

    const result = await listUnprocessed('PSI3451', vault)
    expect(result).toEqual([])
  })
})
