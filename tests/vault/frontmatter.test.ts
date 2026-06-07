import { describe, it, expect } from 'vitest'
import {
  parseFrontmatter,
  getString,
  getNumber,
  getProgress,
  getStringArray,
} from '../../src/vault/frontmatter.js'

describe('parseFrontmatter', () => {
  it('extracts YAML frontmatter and the body content', () => {
    const { data, content } = parseFrontmatter('---\nid: my-task\nstatus: 🧩\n---\nbody text')
    expect(data['id']).toBe('my-task')
    expect(data['status']).toBe('🧩')
    expect(content.trim()).toBe('body text')
  })

  it('does not throw on Obsidian wikilink values', () => {
    const raw = "---\ndepends:\n  - '[[Other Task|alias]]'\n---\n"
    expect(() => parseFrontmatter(raw)).not.toThrow()
  })
})

describe('getString', () => {
  it('returns string values as-is', () => {
    expect(getString({ id: 'abc' }, 'id')).toBe('abc')
  })

  it('normalizes a YAML-parsed bare date to YYYY-MM-DD', () => {
    expect(getString({ deadline: new Date('2026-06-15T00:00:00.000Z') }, 'deadline')).toBe('2026-06-15')
  })

  it('returns undefined for missing or non-string/date values', () => {
    expect(getString({}, 'missing')).toBeUndefined()
    expect(getString({ n: 5 }, 'n')).toBeUndefined()
  })
})

describe('getNumber', () => {
  it('returns numbers as-is and undefined otherwise', () => {
    expect(getNumber({ n: 5 }, 'n')).toBe(5)
    expect(getNumber({ n: '5' }, 'n')).toBeUndefined()
    expect(getNumber({}, 'n')).toBeUndefined()
  })
})

describe('getProgress', () => {
  it('clamps numeric values to 0..100', () => {
    expect(getProgress({ progresso: 50 })).toBe(50)
    expect(getProgress({ progresso: 150 })).toBe(100)
    expect(getProgress({ progresso: -10 })).toBe(0)
  })

  it('parses percentage and bare-number strings', () => {
    expect(getProgress({ progresso: '75%' })).toBe(75)
    expect(getProgress({ progresso: '40' })).toBe(40)
  })

  it('falls back to "progress" and finally to 0', () => {
    expect(getProgress({ progress: 30 })).toBe(30)
    expect(getProgress({})).toBe(0)
    expect(getProgress({ progresso: 'not-a-number' })).toBe(0)
  })
})

describe('getStringArray', () => {
  it('returns only the string elements of an array field', () => {
    expect(getStringArray({ depends: ['a', 'b', 3, null] }, 'depends')).toEqual(['a', 'b'])
  })

  it('returns an empty array for missing or non-array fields', () => {
    expect(getStringArray({}, 'depends')).toEqual([])
    expect(getStringArray({ depends: 'not-an-array' }, 'depends')).toEqual([])
  })
})
