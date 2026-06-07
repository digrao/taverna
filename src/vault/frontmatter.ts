import matter from 'gray-matter'
import type { RawFrontmatter } from './types.js'

export function parseFrontmatter(rawContent: string): { data: RawFrontmatter; content: string } {
  const { data, content } = matter(rawContent)
  return { data: data as RawFrontmatter, content }
}

export function getString(fm: RawFrontmatter, key: string): string | undefined {
  const v = fm[key]
  if (typeof v === 'string') return v
  // YAML parses bare dates (2026-06-01) as Date objects
  if (v instanceof Date) return v.toISOString().split('T')[0]
  return undefined
}

export function getNumber(fm: RawFrontmatter, key: string): number | undefined {
  const v = fm[key]
  return typeof v === 'number' ? v : undefined
}

// Accepts "75%", "75", or numeric 75 → returns 0-100
export function getProgress(fm: RawFrontmatter): number {
  const v = fm['progresso'] ?? fm['progress']
  if (typeof v === 'number') return Math.min(100, Math.max(0, v))
  if (typeof v === 'string') {
    const n = parseInt(v.replace('%', ''), 10)
    return isNaN(n) ? 0 : Math.min(100, Math.max(0, n))
  }
  return 0
}

export function getStringArray(fm: RawFrontmatter, key: string): string[] {
  const v = fm[key]
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string')
}
