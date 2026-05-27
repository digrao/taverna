import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  formatConfirmMessage,
  parseConfirmResponse,
  loadMatrixSchedulerConfig,
} from '../src/pm/matrix-confirm.js'

// ── formatConfirmMessage ──────────────────────────────────────────────────────

describe('formatConfirmMessage', () => {
  const entries = [
    { project: 'PSI3451', agentId: '@study-assistant' },
    { project: 'taverna', agentId: '@dev-agent' },
  ]

  it('includes the time in HH:MM format', () => {
    const now = new Date('2026-05-27T14:05:00')
    const msg = formatConfirmMessage(entries, now, 5, 'run_all')
    expect(msg).toContain('14:05')
  })

  it('lists each project with 1-based index', () => {
    const msg = formatConfirmMessage(entries, new Date(), 5, 'run_all')
    expect(msg).toContain('1. @study-assistant → PSI3451')
    expect(msg).toContain('2. @dev-agent → taverna')
  })

  it('shows run_all in timeout line', () => {
    const msg = formatConfirmMessage(entries, new Date(), 5, 'run_all')
    expect(msg).toContain('all')
  })

  it('shows nada for skip on_timeout', () => {
    const msg = formatConfirmMessage(entries, new Date(), 3, 'skip')
    expect(msg).toContain('nada')
    expect(msg).toContain('3 min')
  })
})

// ── parseConfirmResponse ──────────────────────────────────────────────────────

describe('parseConfirmResponse', () => {
  it('returns "all" for "all"', () => {
    expect(parseConfirmResponse('all', 3)).toBe('all')
  })

  it('returns "all" case-insensitively', () => {
    expect(parseConfirmResponse('ALL', 3)).toBe('all')
    expect(parseConfirmResponse('  All  ', 3)).toBe('all')
  })

  it('returns "skip" for "skip"', () => {
    expect(parseConfirmResponse('skip', 3)).toBe('skip')
  })

  it('returns "skip" case-insensitively', () => {
    expect(parseConfirmResponse('SKIP', 3)).toBe('skip')
  })

  it('returns 0-based indices for "1 3"', () => {
    expect(parseConfirmResponse('1 3', 4)).toEqual([0, 2])
  })

  it('returns single index for "2"', () => {
    expect(parseConfirmResponse('2', 3)).toEqual([1])
  })

  it('deduplicates repeated numbers', () => {
    expect(parseConfirmResponse('1 1 2', 3)).toEqual([0, 1])
  })

  it('returns "all" when number is out of range (too large)', () => {
    expect(parseConfirmResponse('5', 3)).toBe('all')
  })

  it('returns "all" when number is 0', () => {
    expect(parseConfirmResponse('0', 3)).toBe('all')
  })

  it('returns "all" for empty body', () => {
    expect(parseConfirmResponse('   ', 3)).toBe('all')
  })

  it('returns "all" for unrecognized text', () => {
    expect(parseConfirmResponse('foo bar', 3)).toBe('all')
  })
})

// ── loadMatrixSchedulerConfig ─────────────────────────────────────────────────

describe('loadMatrixSchedulerConfig', () => {
  let tmpDir: string

  function setup(content: string): string {
    tmpDir = mkdtempSync(join(tmpdir(), 'matrix-cfg-test-'))
    const path = join(tmpDir, 'taverna.config.yaml')
    writeFileSync(path, content)
    return path
  }

  function cleanup() {
    rmSync(tmpDir, { recursive: true, force: true })
  }

  it('returns undefined when file does not exist', () => {
    expect(loadMatrixSchedulerConfig('/nonexistent/path.yaml')).toBeUndefined()
  })

  it('returns undefined when matrix key is absent', () => {
    const path = setup('budget:\n  global_tokens_daily: 1000\n')
    try {
      expect(loadMatrixSchedulerConfig(path)).toBeUndefined()
    } finally {
      cleanup()
    }
  })

  it('parses full matrix config', () => {
    const path = setup('matrix:\n  timeout_min: 3\n  on_timeout: skip\n  poll_interval_ms: 2000\n')
    try {
      const cfg = loadMatrixSchedulerConfig(path)
      expect(cfg).toEqual({ timeout_min: 3, on_timeout: 'skip', poll_interval_ms: 2000 })
    } finally {
      cleanup()
    }
  })

  it('defaults timeout_min to 5 when absent', () => {
    const path = setup('matrix:\n  on_timeout: run_all\n')
    try {
      const cfg = loadMatrixSchedulerConfig(path)
      expect(cfg!.timeout_min).toBe(5)
    } finally {
      cleanup()
    }
  })

  it('defaults on_timeout to run_all for unknown value', () => {
    const path = setup('matrix:\n  on_timeout: bogus\n')
    try {
      const cfg = loadMatrixSchedulerConfig(path)
      expect(cfg!.on_timeout).toBe('run_all')
    } finally {
      cleanup()
    }
  })

  it('defaults poll_interval_ms to 5000 when absent', () => {
    const path = setup('matrix:\n  timeout_min: 1\n')
    try {
      const cfg = loadMatrixSchedulerConfig(path)
      expect(cfg!.poll_interval_ms).toBe(5_000)
    } finally {
      cleanup()
    }
  })
})
