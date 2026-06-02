import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { recordCost, checkBudget, getBudgetStatus } from '../src/pm/observability/budget.js'

function makeVault(): string {
  return mkdtempSync(join(tmpdir(), 'budget-test-'))
}

function cleanup(vault: string): void {
  rmSync(vault, { recursive: true, force: true })
}

describe('recordCost with tokens', () => {
  it('persists token counts and retrieves via getBudgetStatus', () => {
    const vault = makeVault()
    try {
      recordCost(vault, 'proj1', '@agent', 0.05, {
        in: 1000,
        out: 200,
        cache_read: 500,
        cache_fill: 300,
      })
      const status = getBudgetStatus(vault, {})
      const proj = status.projects.find((p) => p.id === 'proj1')
      expect(proj).toBeDefined()
      expect(proj!.spent_tokens).toBe(2000) // 1000+200+500+300
      expect(proj!.spent_usd).toBeCloseTo(0.05)
    } finally {
      cleanup(vault)
    }
  })

  it('handles missing tokens field in old entries gracefully', () => {
    const vault = makeVault()
    try {
      recordCost(vault, 'old-proj', '@agent', 0.01)
      const check = checkBudget(vault, 'old-proj', { tokens_daily: 1000 })
      expect(check.spent_tokens).toBe(0)
      expect(check.allowed).toBe(true)
    } finally {
      cleanup(vault)
    }
  })
})

describe('checkBudget global aggregation', () => {
  it('aggregates all projects for __global__', () => {
    const vault = makeVault()
    try {
      recordCost(vault, 'projA', '@agent', 0.01, { in: 100, out: 50, cache_read: 0, cache_fill: 0 })
      recordCost(vault, 'projB', '@agent', 0.02, {
        in: 200,
        out: 100,
        cache_read: 0,
        cache_fill: 0,
      })
      const check = checkBudget(vault, '__global__', { tokens_daily: 1000 })
      expect(check.spent_tokens).toBe(450) // 100+50+200+100
      expect(check.allowed).toBe(true)
      expect(check.limit_tokens).toBe(1000)
    } finally {
      cleanup(vault)
    }
  })

  it('global exceeded blocks even when project has no individual limit', () => {
    const vault = makeVault()
    try {
      recordCost(vault, 'projA', '@agent', 0.01, {
        in: 900,
        out: 200,
        cache_read: 0,
        cache_fill: 0,
      })
      const global = checkBudget(vault, '__global__', { tokens_daily: 1000 })
      expect(global.allowed).toBe(false)
      // Project itself has no limit — would be allowed on its own
      const project = checkBudget(vault, 'projA', {})
      expect(project.allowed).toBe(true)
    } finally {
      cleanup(vault)
    }
  })

  it('per-project check only counts entries for that project', () => {
    const vault = makeVault()
    try {
      recordCost(vault, 'projA', '@agent', 0.01, { in: 100, out: 50, cache_read: 0, cache_fill: 0 })
      recordCost(vault, 'projB', '@agent', 0.02, {
        in: 200,
        out: 100,
        cache_read: 0,
        cache_fill: 0,
      })
      const checkA = checkBudget(vault, 'projA', { tokens_daily: 100 })
      expect(checkA.spent_tokens).toBe(150) // only projA: 100+50
      expect(checkA.allowed).toBe(false) // 150 > 100
    } finally {
      cleanup(vault)
    }
  })

  it('returns allowed: true when no limits are set', () => {
    const vault = makeVault()
    try {
      const check = checkBudget(vault, '__global__', {})
      expect(check.allowed).toBe(true)
      expect(check.spent_tokens).toBe(0)
    } finally {
      cleanup(vault)
    }
  })

  it('reports correct pct when within limit', () => {
    const vault = makeVault()
    try {
      recordCost(vault, 'proj', '@agent', 0.01, { in: 250, out: 0, cache_read: 0, cache_fill: 0 })
      const check = checkBudget(vault, 'proj', { tokens_daily: 1000 })
      expect(check.pct).toBe(25)
      expect(check.allowed).toBe(true)
    } finally {
      cleanup(vault)
    }
  })
})

describe('checkBudget USD limit', () => {
  it('blocks when usd_daily is exceeded', () => {
    const vault = makeVault()
    try {
      recordCost(vault, 'proj', '@agent', 0.6)
      const check = checkBudget(vault, 'proj', { usd_daily: 0.5 })
      expect(check.allowed).toBe(false)
      expect(check.limit_usd).toBe(0.5)
    } finally {
      cleanup(vault)
    }
  })

  it('allows when usd_daily is not yet exceeded', () => {
    const vault = makeVault()
    try {
      recordCost(vault, 'proj', '@agent', 0.3)
      const check = checkBudget(vault, 'proj', { usd_daily: 0.5 })
      expect(check.allowed).toBe(true)
    } finally {
      cleanup(vault)
    }
  })
})

describe('getBudgetStatus', () => {
  it('returns global and per-project breakdown', () => {
    const vault = makeVault()
    try {
      recordCost(vault, 'p1', '@a', 0.01, { in: 500, out: 100, cache_read: 0, cache_fill: 0 })
      recordCost(vault, 'p2', '@a', 0.02, { in: 300, out: 50, cache_read: 0, cache_fill: 0 })
      const status = getBudgetStatus(vault, { tokens_daily: 2000 })
      expect(status.global.spent_tokens).toBe(950)
      expect(status.global.limit_tokens).toBe(2000)
      expect(status.global.pct).toBe(48) // 950/2000 = 47.5 → 48
      expect(status.projects).toHaveLength(2)
      const p1 = status.projects.find((p) => p.id === 'p1')
      expect(p1!.spent_tokens).toBe(600)
    } finally {
      cleanup(vault)
    }
  })
})
