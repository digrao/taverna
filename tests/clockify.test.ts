import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import matter from 'gray-matter'

import { parseDuration, matchEntries } from '../src/clockify/sync.js'
import { writeDeepWorkToFrontmatter } from '../src/clockify/vault.js'
import type { TimeEntry, ClockifyProject } from '../src/clockify/types.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = join(tmpdir(), `taverna-clockify-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(tmpDir, { recursive: true })
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function write(relPath: string, content: string): string {
  const fullPath = join(tmpDir, relPath)
  mkdirSync(join(fullPath, '..'), { recursive: true })
  writeFileSync(fullPath, content, 'utf8')
  return fullPath
}

// ── parseDuration ─────────────────────────────────────────────────────────────

describe('parseDuration', () => {
  it('parses hours only', () => {
    expect(parseDuration('PT2H')).toBe(2)
  })

  it('parses minutes only', () => {
    expect(parseDuration('PT30M')).toBeCloseTo(0.5)
  })

  it('parses seconds only', () => {
    expect(parseDuration('PT3600S')).toBeCloseTo(1)
  })

  it('parses hours and minutes', () => {
    expect(parseDuration('PT1H30M')).toBeCloseTo(1.5)
  })

  it('parses full duration', () => {
    expect(parseDuration('PT2H30M15S')).toBeCloseTo(2.5042, 3)
  })

  it('returns 0 for empty string', () => {
    expect(parseDuration('')).toBe(0)
  })

  it('returns 0 for bare PT', () => {
    expect(parseDuration('PT')).toBe(0)
  })
})

// ── matchEntries ──────────────────────────────────────────────────────────────

describe('matchEntries', () => {
  const clockifyProjects: ClockifyProject[] = [
    { id: 'cp1', name: 'PSI3451' },
    { id: 'cp2', name: 'taverna' },
  ]

  const weekStart = new Date('2026-05-18T00:00:00Z')

  it('maps entries to vault project ids via clockify project name', () => {
    const entries: TimeEntry[] = [
      { id: 'e1', projectId: 'cp1', timeInterval: { start: '2026-05-19T10:00:00Z', end: '2026-05-19T12:00:00Z', duration: 'PT2H' } },
    ]
    const stats = matchEntries(entries, clockifyProjects, weekStart)
    expect(stats).toHaveLength(1)
    expect(stats[0]?.projectId).toBe('PSI3451')
    expect(stats[0]?.totalHours).toBe(2)
    expect(stats[0]?.weekHours).toBe(2)
  })

  it('counts totalHours for all entries but weekHours only for entries on or after weekStart', () => {
    const entries: TimeEntry[] = [
      { id: 'e1', projectId: 'cp1', timeInterval: { start: '2026-05-10T10:00:00Z', end: '2026-05-10T12:00:00Z', duration: 'PT2H' } },
      { id: 'e2', projectId: 'cp1', timeInterval: { start: '2026-05-19T10:00:00Z', end: '2026-05-19T11:00:00Z', duration: 'PT1H' } },
    ]
    const stats = matchEntries(entries, clockifyProjects, weekStart)
    expect(stats[0]?.totalHours).toBe(3)
    expect(stats[0]?.weekHours).toBe(1)
  })

  it('tracks lastEntry as the latest end timestamp', () => {
    const entries: TimeEntry[] = [
      { id: 'e1', projectId: 'cp1', timeInterval: { start: '2026-05-19T10:00:00Z', end: '2026-05-19T11:00:00Z', duration: 'PT1H' } },
      { id: 'e2', projectId: 'cp1', timeInterval: { start: '2026-05-20T10:00:00Z', end: '2026-05-20T12:00:00Z', duration: 'PT2H' } },
    ]
    const stats = matchEntries(entries, clockifyProjects, weekStart)
    expect(stats[0]?.lastEntry).toBe('2026-05-20T12:00:00Z')
  })

  it('skips entries with no projectId', () => {
    const entries: TimeEntry[] = [
      { id: 'e1', projectId: null, timeInterval: { start: '2026-05-19T10:00:00Z', end: '2026-05-19T11:00:00Z', duration: 'PT1H' } },
    ]
    const stats = matchEntries(entries, clockifyProjects, weekStart)
    expect(stats).toHaveLength(0)
  })

  it('skips entries with no duration (running timer)', () => {
    const entries: TimeEntry[] = [
      { id: 'e1', projectId: 'cp1', timeInterval: { start: '2026-05-19T10:00:00Z', end: '2026-05-19T11:00:00Z', duration: null } },
    ]
    const stats = matchEntries(entries, clockifyProjects, weekStart)
    expect(stats).toHaveLength(0)
  })

  it('skips entries whose clockify projectId is not in the project list', () => {
    const entries: TimeEntry[] = [
      { id: 'e1', projectId: 'unknown', timeInterval: { start: '2026-05-19T10:00:00Z', end: '2026-05-19T11:00:00Z', duration: 'PT1H' } },
    ]
    const stats = matchEntries(entries, clockifyProjects, weekStart)
    expect(stats).toHaveLength(0)
  })

  it('handles multiple projects independently', () => {
    const entries: TimeEntry[] = [
      { id: 'e1', projectId: 'cp1', timeInterval: { start: '2026-05-19T10:00:00Z', end: '2026-05-19T12:00:00Z', duration: 'PT2H' } },
      { id: 'e2', projectId: 'cp2', timeInterval: { start: '2026-05-20T09:00:00Z', end: '2026-05-20T10:30:00Z', duration: 'PT1H30M' } },
    ]
    const stats = matchEntries(entries, clockifyProjects, weekStart)
    expect(stats).toHaveLength(2)
    const psi = stats.find(s => s.projectId === 'PSI3451')
    const tav = stats.find(s => s.projectId === 'taverna')
    expect(psi?.totalHours).toBe(2)
    expect(tav?.totalHours).toBeCloseTo(1.5)
  })

  it('rounds hours to 2 decimal places', () => {
    const entries: TimeEntry[] = [
      { id: 'e1', projectId: 'cp1', timeInterval: { start: '2026-05-19T10:00:00Z', end: '2026-05-19T10:01:00Z', duration: 'PT1M' } },
    ]
    const stats = matchEntries(entries, clockifyProjects, weekStart)
    expect(stats[0]?.totalHours).toBe(0.02)
  })
})

// ── writeDeepWorkToFrontmatter ────────────────────────────────────────────────

describe('writeDeepWorkToFrontmatter', () => {
  it('writes deepwork fields into project frontmatter', async () => {
    const filePath = write('PSI3451.md', '---\nid: PSI3451\ntipo: USP\n---\nContent here.\n')
    await writeDeepWorkToFrontmatter(filePath, {
      projectId: 'PSI3451',
      totalHours: 12.5,
      weekHours: 3.0,
      lastEntry: '2026-05-19T22:00:00Z',
    })
    const { data } = matter(readFileSync(filePath, 'utf8'))
    expect(data['deepwork_total_h']).toBe(12.5)
    expect(data['deepwork_week_h']).toBe(3.0)
    expect(data['deepwork_last']).toBe('2026-05-19T22:00:00Z')
    expect(data['id']).toBe('PSI3451')
  })

  it('overwrites existing deepwork fields without touching other fields', async () => {
    const filePath = write('proj.md', '---\nid: proj\ndeepwork_total_h: 5.0\ndeepwork_week_h: 1.0\n---\nBody.\n')
    await writeDeepWorkToFrontmatter(filePath, {
      projectId: 'proj',
      totalHours: 10.0,
      weekHours: 4.0,
      lastEntry: '2026-05-21T10:00:00Z',
    })
    const { data, content } = matter(readFileSync(filePath, 'utf8'))
    expect(data['deepwork_total_h']).toBe(10.0)
    expect(data['deepwork_week_h']).toBe(4.0)
    expect(data['id']).toBe('proj')
    expect(content.trim()).toBe('Body.')
  })
})
