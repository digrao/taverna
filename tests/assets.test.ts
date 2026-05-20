import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'

import { sha256File } from '../src/assets/hash.js'
import { parsePointer, formatPointer, readPointer, writePointer } from '../src/assets/pointer.js'
import { addToGitignore } from '../src/assets/gitignore.js'
import { storeAssets } from '../src/assets/store.js'
import { pullAssets } from '../src/assets/pull.js'
import { statusAssets } from '../src/assets/status.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = join(tmpdir(), `taverna-assets-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(tmpDir, { recursive: true })
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function write(relPath: string, content: string): string {
  const full = join(tmpDir, relPath)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content, 'utf8')
  return full
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

// ── sha256File ────────────────────────────────────────────────────────────────

describe('sha256File', () => {
  it('returns correct hash for known content', async () => {
    const content = 'hello world'
    const filePath = write('test.txt', content)
    const hash = await sha256File(filePath)
    expect(hash).toBe(sha256(content))
  })

  it('returns different hashes for different content', async () => {
    const a = write('a.txt', 'content A')
    const b = write('b.txt', 'content B')
    expect(await sha256File(a)).not.toBe(await sha256File(b))
  })
})

// ── parsePointer / formatPointer ──────────────────────────────────────────────

describe('parsePointer', () => {
  it('parses all fields correctly', () => {
    const content = [
      'taverna-asset-v1',
      'name: lecture.pdf',
      'sha256: abc123def456',
      'size: 2048000',
      'copyparty: http://192.168.1.1:3900/vault/lecture.pdf',
      'gdrive: 1BxiMVs0XRA5nFMdK',
    ].join('\n')

    const p = parsePointer(content)
    expect(p.name).toBe('lecture.pdf')
    expect(p.sha256).toBe('abc123def456')
    expect(p.size).toBe(2048000)
    expect(p.copyparty).toBe('http://192.168.1.1:3900/vault/lecture.pdf')
    expect(p.gdrive).toBe('1BxiMVs0XRA5nFMdK')
  })

  it('parses pointer without optional fields', () => {
    const p = parsePointer('taverna-asset-v1\nname: f.pdf\nsha256: abc\nsize: 100\n')
    expect(p.copyparty).toBeUndefined()
    expect(p.gdrive).toBeUndefined()
  })

  it('throws on missing marker', () => {
    expect(() => parsePointer('name: f.pdf\nsha256: abc\nsize: 100')).toThrow()
  })

  it('throws on missing required fields', () => {
    expect(() => parsePointer('taverna-asset-v1\nname: f.pdf\n')).toThrow()
  })
})

describe('formatPointer', () => {
  it('starts with the marker line', () => {
    const out = formatPointer({ name: 'f.pdf', sha256: 'abc', size: 100 })
    expect(out.split('\n')[0]).toBe('taverna-asset-v1')
  })

  it('uses key: value format for all fields', () => {
    const out = formatPointer({
      name: 'f.pdf',
      sha256: 'deadbeef',
      size: 512,
      copyparty: 'http://host/f.pdf',
    })
    expect(out).toContain('name: f.pdf')
    expect(out).toContain('sha256: deadbeef')
    expect(out).toContain('size: 512')
    expect(out).toContain('copyparty: http://host/f.pdf')
  })

  it('omits undefined optional fields', () => {
    const out = formatPointer({ name: 'f.pdf', sha256: 'abc', size: 10 })
    expect(out).not.toContain('copyparty')
    expect(out).not.toContain('gdrive')
  })

  it('round-trips through parsePointer', () => {
    const original = { name: 'f.pdf', sha256: 'abc123', size: 999, copyparty: 'http://x/f.pdf' }
    const parsed = parsePointer(formatPointer(original))
    expect(parsed).toEqual(original)
  })
})

describe('readPointer / writePointer', () => {
  it('writes and reads back correctly', async () => {
    const p = { name: 'doc.pdf', sha256: 'deadc0de', size: 1024 }
    const path = join(tmpDir, 'doc.pdf.asset')
    await writePointer(path, p)
    const loaded = await readPointer(path)
    expect(loaded).toEqual(p)
  })
})

// ── addToGitignore ────────────────────────────────────────────────────────────

describe('addToGitignore', () => {
  it('creates .gitignore with patterns when absent', async () => {
    await addToGitignore(tmpDir, ['*.pdf', '*.zip'])
    const content = readFileSync(join(tmpDir, '.gitignore'), 'utf8')
    expect(content).toContain('*.pdf')
    expect(content).toContain('*.zip')
  })

  it('appends new patterns to existing .gitignore', async () => {
    write('.gitignore', '*.log\n')
    await addToGitignore(tmpDir, ['*.pdf'])
    const content = readFileSync(join(tmpDir, '.gitignore'), 'utf8')
    expect(content).toContain('*.log')
    expect(content).toContain('*.pdf')
  })

  it('does not duplicate existing patterns', async () => {
    write('.gitignore', '*.pdf\n')
    await addToGitignore(tmpDir, ['*.pdf'])
    const content = readFileSync(join(tmpDir, '.gitignore'), 'utf8')
    expect(content.split('\n').filter(l => l === '*.pdf')).toHaveLength(1)
  })
})

// ── storeAssets ───────────────────────────────────────────────────────────────

describe('storeAssets', () => {
  it('lists heavy files in stored when dryRun is true', async () => {
    write('assets/1_Aula/aula.pdf', 'fake pdf')
    write('assets/notas.md', '# notes')

    const result = await storeAssets(join(tmpDir, 'assets'), {
      vaultPath: tmpDir,
      dryRun: true,
    })

    expect(result.stored).toHaveLength(1)
    expect(result.stored[0]).toContain('aula.pdf')
    expect(result.stored[0]).not.toContain('.md')
  })

  it('creates .asset file and updates .gitignore after upload', async () => {
    write('assets/doc.pdf', 'fake pdf content')

    const mockFetch = vi.fn(async () => new Response('', { status: 200 }))

    const result = await storeAssets(join(tmpDir, 'assets'), {
      vaultPath: tmpDir,
      copypartyUrl: 'http://192.168.1.1:3900',
      fetch: mockFetch as typeof globalThis.fetch,
    })

    expect(result.stored).toHaveLength(1)
    expect(result.errors).toHaveLength(0)

    const assetPath = join(tmpDir, 'assets', 'doc.pdf.asset')
    expect(existsSync(assetPath)).toBe(true)

    const pointer = parsePointer(readFileSync(assetPath, 'utf8'))
    expect(pointer.name).toBe('doc.pdf')
    expect(pointer.copyparty).toContain('doc.pdf')
    expect(pointer.sha256).toBe(sha256('fake pdf content'))

    const gitignore = readFileSync(join(tmpDir, 'assets', '.gitignore'), 'utf8')
    expect(gitignore).toContain('*.pdf')
  })

  it('calls fetch with PUT method', async () => {
    write('assets/slide.ppt', 'fake ppt')
    const mockFetch = vi.fn(async () => new Response('', { status: 200 }))

    await storeAssets(join(tmpDir, 'assets'), {
      vaultPath: tmpDir,
      copypartyUrl: 'http://host:3900',
      fetch: mockFetch as typeof globalThis.fetch,
    })

    expect(mockFetch).toHaveBeenCalledOnce()
    expect(mockFetch.mock.calls[0]?.[1]).toMatchObject({ method: 'PUT' })
  })

  it('skips files that already have a .asset pointer', async () => {
    write('assets/old.pdf', 'content')
    write('assets/old.pdf.asset', 'taverna-asset-v1\nname: old.pdf\nsha256: abc\nsize: 7\n')

    const mockFetch = vi.fn(async () => new Response('', { status: 200 }))
    const result = await storeAssets(join(tmpDir, 'assets'), {
      vaultPath: tmpDir,
      copypartyUrl: 'http://host:3900',
      fetch: mockFetch as typeof globalThis.fetch,
    })

    expect(result.skipped).toHaveLength(1)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns empty result for non-existent assets dir', async () => {
    const result = await storeAssets(join(tmpDir, 'assets'), { vaultPath: tmpDir })
    expect(result.stored).toHaveLength(0)
    expect(result.errors).toHaveLength(0)
  })
})

// ── pullAssets ────────────────────────────────────────────────────────────────

describe('pullAssets', () => {
  it('skips files whose sha256 matches the pointer', async () => {
    const content = 'real pdf content'
    write('assets/doc.pdf', content)
    write('assets/doc.pdf.asset', [
      'taverna-asset-v1',
      'name: doc.pdf',
      `sha256: ${sha256(content)}`,
      `size: ${content.length}`,
      'copyparty: http://host/doc.pdf',
    ].join('\n') + '\n')

    const mockFetch = vi.fn()
    const result = await pullAssets(join(tmpDir, 'assets'), {
      fetch: mockFetch as typeof globalThis.fetch,
    })

    expect(result.skipped).toHaveLength(1)
    expect(result.downloaded).toHaveLength(0)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('downloads missing file and verifies sha256', async () => {
    const content = 'downloaded content'
    write('assets/new.pdf.asset', [
      'taverna-asset-v1',
      'name: new.pdf',
      `sha256: ${sha256(content)}`,
      `size: ${content.length}`,
      'copyparty: http://host/new.pdf',
    ].join('\n') + '\n')

    const mockFetch = vi.fn(async () => new Response(content, { status: 200 }))
    const result = await pullAssets(join(tmpDir, 'assets'), {
      fetch: mockFetch as typeof globalThis.fetch,
    })

    expect(result.downloaded).toHaveLength(1)
    expect(result.errors).toHaveLength(0)
    expect(existsSync(join(tmpDir, 'assets', 'new.pdf'))).toBe(true)
  })

  it('reports error when sha256 does not match after download', async () => {
    write('assets/bad.pdf.asset', [
      'taverna-asset-v1',
      'name: bad.pdf',
      'sha256: wronghash000',
      'size: 10',
      'copyparty: http://host/bad.pdf',
    ].join('\n') + '\n')

    const mockFetch = vi.fn(async () => new Response('actual content', { status: 200 }))
    const result = await pullAssets(join(tmpDir, 'assets'), {
      fetch: mockFetch as typeof globalThis.fetch,
    })

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.error).toContain('SHA-256 mismatch')
    expect(existsSync(join(tmpDir, 'assets', 'bad.pdf'))).toBe(false)
  })

  it('does not fetch when dryRun is true', async () => {
    write('assets/x.pdf.asset', 'taverna-asset-v1\nname: x.pdf\nsha256: abc\nsize: 5\ncopyparty: http://h/x\n')
    const mockFetch = vi.fn()
    const result = await pullAssets(join(tmpDir, 'assets'), {
      dryRun: true,
      fetch: mockFetch as typeof globalThis.fetch,
    })
    expect(result.downloaded).toHaveLength(1)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

// ── statusAssets ──────────────────────────────────────────────────────────────

describe('statusAssets', () => {
  it('reports ok when real file matches pointer sha256', async () => {
    const content = 'ok content'
    write('assets/ok.pdf', content)
    write('assets/ok.pdf.asset', [
      'taverna-asset-v1',
      'name: ok.pdf',
      `sha256: ${sha256(content)}`,
      `size: ${content.length}`,
    ].join('\n') + '\n')

    const statuses = await statusAssets(join(tmpDir, 'assets'))
    const s = statuses.find(x => x.relativePath === 'ok.pdf')
    expect(s?.state).toBe('ok')
  })

  it('reports missing when real file is absent', async () => {
    write('assets/gone.pdf.asset', 'taverna-asset-v1\nname: gone.pdf\nsha256: abc\nsize: 100\n')
    const statuses = await statusAssets(join(tmpDir, 'assets'))
    expect(statuses.find(x => x.relativePath === 'gone.pdf')?.state).toBe('missing')
  })

  it('reports modified when sha256 differs', async () => {
    write('assets/changed.pdf', 'new content')
    write('assets/changed.pdf.asset', 'taverna-asset-v1\nname: changed.pdf\nsha256: oldhash\nsize: 11\n')
    const statuses = await statusAssets(join(tmpDir, 'assets'))
    expect(statuses.find(x => x.relativePath === 'changed.pdf')?.state).toBe('modified')
  })

  it('reports no-pointer for heavy files without .asset', async () => {
    write('assets/unstored.pdf', 'content')
    const statuses = await statusAssets(join(tmpDir, 'assets'))
    expect(statuses.find(x => x.relativePath === 'unstored.pdf')?.state).toBe('no-pointer')
  })

  it('returns empty list for non-existent dir', async () => {
    const statuses = await statusAssets(join(tmpDir, 'assets'))
    expect(statuses).toHaveLength(0)
  })
})
