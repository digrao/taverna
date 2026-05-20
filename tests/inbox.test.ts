import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  scanInbox,
  selectBatch,
  buildPrompt,
  parseClassifications,
} from '../src/inbox/process.js'
import { parseFrontmatter } from '../src/vault/frontmatter.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = join(tmpdir(), `taverna-inbox-${Date.now()}-${Math.random().toString(36).slice(2)}`)
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

// ── scanInbox ─────────────────────────────────────────────────────────────────

describe('scanInbox', () => {
  it('returns empty array when dir does not exist', async () => {
    const files = await scanInbox(join(tmpDir, 'missing'))
    expect(files).toHaveLength(0)
  })

  it('finds only .md files', async () => {
    const dir = join(tmpDir, '00_Inbox')
    mkdirSync(dir)
    writeFileSync(join(dir, 'idea.md'), '# idea')
    writeFileSync(join(dir, 'notes.txt'), 'text')
    writeFileSync(join(dir, 'image.png'), 'binary')
    const files = await scanInbox(dir)
    expect(files).toHaveLength(1)
    expect(files[0]!.filename).toBe('idea.md')
  })

  it('returns files sorted by name', async () => {
    const dir = join(tmpDir, '00_Inbox')
    mkdirSync(dir)
    writeFileSync(join(dir, 'c.md'), 'c')
    writeFileSync(join(dir, 'a.md'), 'a')
    writeFileSync(join(dir, 'b.md'), 'b')
    const files = await scanInbox(dir)
    expect(files.map(f => f.filename)).toEqual(['a.md', 'b.md', 'c.md'])
  })
})

// ── selectBatch ───────────────────────────────────────────────────────────────

describe('selectBatch', () => {
  it('selects files until maxChars is reached', () => {
    const files = [
      { filename: 'a.md', filePath: '', content: 'x'.repeat(100) },
      { filename: 'b.md', filePath: '', content: 'x'.repeat(100) },
      { filename: 'c.md', filePath: '', content: 'x'.repeat(100) },
    ]
    const batch = selectBatch(files, 250)
    expect(batch).toHaveLength(2)
  })

  it('returns all files when content fits within maxChars', () => {
    const files = [
      { filename: 'a.md', filePath: '', content: 'hello' },
      { filename: 'b.md', filePath: '', content: 'world' },
    ]
    const batch = selectBatch(files, 10000)
    expect(batch).toHaveLength(2)
  })

  it('returns empty array when first file alone exceeds maxChars', () => {
    const files = [{ filename: 'a.md', filePath: '', content: 'x'.repeat(1000) }]
    const batch = selectBatch(files, 500)
    expect(batch).toHaveLength(0)
  })
})

// ── buildPrompt ───────────────────────────────────────────────────────────────

describe('buildPrompt', () => {
  it('includes directive text', () => {
    const prompt = buildPrompt('You are an agent.', [
      { filename: 'a.md', filePath: '', content: '# Idea A' },
    ])
    expect(prompt).toContain('You are an agent.')
  })

  it('includes file contents and filenames', () => {
    const prompt = buildPrompt('directive', [
      { filename: 'note.md', filePath: '', content: '# Note content' },
    ])
    expect(prompt).toContain('note.md')
    expect(prompt).toContain('Note content')
  })

  it('separates multiple files with dividers', () => {
    const prompt = buildPrompt('directive', [
      { filename: 'a.md', filePath: '', content: 'A' },
      { filename: 'b.md', filePath: '', content: 'B' },
    ])
    expect(prompt).toContain('a.md')
    expect(prompt).toContain('b.md')
    expect(prompt).toContain('---')
  })
})

// ── parseClassifications ──────────────────────────────────────────────────────

describe('parseClassifications', () => {
  it('parses a valid JSON block', () => {
    const output = [
      'Some preamble.',
      '```json',
      '[{"file":"a.md","cluster":"infra","relevancia":4}]',
      '```',
    ].join('\n')
    const cls = parseClassifications(output)
    expect(cls).toHaveLength(1)
    expect(cls[0]!.file).toBe('a.md')
    expect(cls[0]!.cluster).toBe('infra')
    expect(cls[0]!.relevancia).toBe(4)
  })

  it('parses bare JSON array without code fence', () => {
    const output = '[{"file":"b.md","cluster":"dev","relevancia":3}]'
    const cls = parseClassifications(output)
    expect(cls).toHaveLength(1)
    expect(cls[0]!.file).toBe('b.md')
  })

  it('throws when no JSON found', () => {
    expect(() => parseClassifications('No JSON here at all.')).toThrow()
  })

  it('parses multiple entries', () => {
    const output = '```json\n' +
      '[{"file":"a.md","cluster":"infra","relevancia":5},' +
      '{"file":"b.md","cluster":"estudo","relevancia":2}]\n```'
    const cls = parseClassifications(output)
    expect(cls).toHaveLength(2)
  })
})
