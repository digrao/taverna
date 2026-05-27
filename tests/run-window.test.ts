import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isInTimeWindow, isRunWindowOpen } from '../src/pm/run-window.js'

vi.mock('../src/pm/idle.js', () => ({
  isClaudeCodeIdle: vi.fn(),
}))

import { isClaudeCodeIdle } from '../src/pm/idle.js'

// ── isInTimeWindow ────────────────────────────────────────────────────────────

describe('isInTimeWindow', () => {
  it('returns true when time is inside same-day window', () => {
    expect(isInTimeWindow('09:00-17:00', new Date('2026-01-01T10:00:00'))).toBe(true)
  })

  it('returns false when time is before same-day window', () => {
    expect(isInTimeWindow('09:00-17:00', new Date('2026-01-01T08:59:00'))).toBe(false)
  })

  it('returns false when time is after same-day window', () => {
    expect(isInTimeWindow('09:00-17:00', new Date('2026-01-01T17:00:00'))).toBe(false)
  })

  it('returns true at exact window start', () => {
    expect(isInTimeWindow('09:00-17:00', new Date('2026-01-01T09:00:00'))).toBe(true)
  })

  it('returns true inside midnight-crossing window (late night)', () => {
    expect(isInTimeWindow('22:00-07:00', new Date('2026-01-01T23:30:00'))).toBe(true)
  })

  it('returns true inside midnight-crossing window (early morning)', () => {
    expect(isInTimeWindow('22:00-07:00', new Date('2026-01-01T06:00:00'))).toBe(true)
  })

  it('returns false outside midnight-crossing window (midday)', () => {
    expect(isInTimeWindow('22:00-07:00', new Date('2026-01-01T12:00:00'))).toBe(false)
  })

  it('returns true for malformed window string (do not block)', () => {
    expect(isInTimeWindow('invalid', new Date())).toBe(true)
  })
})

// ── isRunWindowOpen ───────────────────────────────────────────────────────────

describe('isRunWindowOpen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('undefined: open (no restriction)', async () => {
    const result = await isRunWindowOpen(undefined, new Date())
    expect(result.open).toBe(true)
  })

  it('always: open regardless of time', async () => {
    const result = await isRunWindowOpen('always', new Date())
    expect(result.open).toBe(true)
  })

  it('idle-only: open when Claude Code is idle', async () => {
    vi.mocked(isClaudeCodeIdle).mockResolvedValue({
      idle: true,
      lastActivityMs: 999_999,
      source: 'unknown',
    })
    const result = await isRunWindowOpen('idle-only', new Date())
    expect(result.open).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('idle-only: closed with claude_active reason when not idle', async () => {
    vi.mocked(isClaudeCodeIdle).mockResolvedValue({
      idle: false,
      lastActivityMs: 60_000,
      source: 'session-jsonl',
    })
    const result = await isRunWindowOpen('idle-only', new Date())
    expect(result.open).toBe(false)
    expect(result.reason).toBe('claude_active')
  })

  it('idle-only: passes thresholdMinutes to isClaudeCodeIdle', async () => {
    vi.mocked(isClaudeCodeIdle).mockResolvedValue({
      idle: true,
      lastActivityMs: 0,
      source: 'unknown',
    })
    await isRunWindowOpen('idle-only', new Date(), 30)
    expect(vi.mocked(isClaudeCodeIdle)).toHaveBeenCalledWith(30)
  })

  it('time window: open when inside window', async () => {
    const result = await isRunWindowOpen('22:00-07:00', new Date('2026-01-01T23:00:00'))
    expect(result.open).toBe(true)
  })

  it('time window: closed with run_window reason when outside', async () => {
    const result = await isRunWindowOpen('22:00-07:00', new Date('2026-01-01T10:00:00'))
    expect(result.open).toBe(false)
    expect(result.reason).toBe('run_window')
  })

  it('time window: nextEligibleAt is set when closed', async () => {
    const result = await isRunWindowOpen('22:00-07:00', new Date('2026-01-01T10:00:00'))
    expect(result.nextEligibleAt).toBeDefined()
    const next = new Date(result.nextEligibleAt!)
    expect(next.getHours()).toBe(22)
    expect(next.getMinutes()).toBe(0)
  })
})
