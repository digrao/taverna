import { describe, it, expect } from 'vitest'
import {
  readProjectPolicy,
  mergePolicy,
  isAtSatisfied,
  isProjectDue,
  getTypePolicy,
  type TypePolicy,
  type PolicyStep,
} from '../src/pm/policies.js'
import type { VaultProject } from '../src/vault/types.js'

const baseProject: VaultProject = {
  id: 'PROJ001',
  tipo: 'USP',
  name: 'PROJ001',
  filePath: '/fake/PROJ001.md',
  priority: 'medium',
  runEvery: 'daily',
  runsTotal: 0,
  tasks: [],
  hasTasksFolder: false,
  hasAssetsFolder: false,
  content: '',
  raw: {},
}

// ── readProjectPolicy ─────────────────────────────────────────────────────────

describe('readProjectPolicy', () => {
  it('returns undefined when no schedule fields in frontmatter', () => {
    expect(readProjectPolicy({})).toBeUndefined()
  })

  it('reads schedule_compose: override', () => {
    const policy = readProjectPolicy({ schedule_compose: 'override', schedule_steps: [] })
    expect(policy?.compose).toBe('override')
  })

  it('defaults to inherit when schedule_compose is absent but steps present', () => {
    const policy = readProjectPolicy({ schedule_steps: [{ agent: '@foo' }] })
    expect(policy?.compose).toBe('inherit')
  })

  it('reads schedule_steps with agent and at', () => {
    const policy = readProjectPolicy({
      schedule_steps: [{ agent: '@foo', at: '09:00' }, { agent: '@bar' }],
    })
    expect(policy?.steps).toEqual([{ agent: '@foo', at: '09:00' }, { agent: '@bar' }])
  })

  it('supports shorthand string steps', () => {
    const policy = readProjectPolicy({ schedule_steps: ['@foo', '@bar'] })
    expect(policy?.steps).toEqual([{ agent: '@foo' }, { agent: '@bar' }])
  })

  it('filters out malformed steps', () => {
    const policy = readProjectPolicy({ schedule_steps: [null, 42, { agent: '@ok' }] })
    expect(policy?.steps).toEqual([{ agent: '@ok' }])
  })

  it('returns compose: override with empty steps when only schedule_compose is set', () => {
    const policy = readProjectPolicy({ schedule_compose: 'override' })
    expect(policy?.compose).toBe('override')
    expect(policy?.steps).toEqual([])
  })
})

// ── mergePolicy ───────────────────────────────────────────────────────────────

describe('mergePolicy', () => {
  const typeSteps: PolicyStep[] = [{ agent: '@type-agent', at: 'EOD' }]

  it('returns type steps when no project policy', () => {
    expect(mergePolicy(typeSteps)).toEqual(typeSteps)
  })

  it('override: returns only project steps', () => {
    const result = mergePolicy(typeSteps, {
      compose: 'override',
      steps: [{ agent: '@proj-agent' }],
    })
    expect(result).toEqual([{ agent: '@proj-agent' }])
  })

  it('override with empty steps: returns empty array', () => {
    const result = mergePolicy(typeSteps, { compose: 'override', steps: [] })
    expect(result).toEqual([])
  })

  it('inherit: concatenates type steps then project steps', () => {
    const result = mergePolicy(typeSteps, { compose: 'inherit', steps: [{ agent: '@extra' }] })
    expect(result).toEqual([{ agent: '@type-agent', at: 'EOD' }, { agent: '@extra' }])
  })

  it('inherit with empty project steps returns only type steps', () => {
    const result = mergePolicy(typeSteps, { compose: 'inherit', steps: [] })
    expect(result).toEqual(typeSteps)
  })

  it('returns empty when both type and project steps are empty (override)', () => {
    expect(mergePolicy([], { compose: 'override', steps: [] })).toEqual([])
  })
})

// ── isAtSatisfied ─────────────────────────────────────────────────────────────

describe('isAtSatisfied', () => {
  it('returns true when at is undefined', () => {
    expect(isAtSatisfied(undefined, new Date())).toBe(true)
  })

  it('EOD: true at 17:00', () => {
    expect(isAtSatisfied('EOD', new Date('2026-01-01T17:00:00'))).toBe(true)
  })

  it('EOD: true after 17:00', () => {
    expect(isAtSatisfied('EOD', new Date('2026-01-01T22:30:00'))).toBe(true)
  })

  it('EOD: false before 17:00', () => {
    expect(isAtSatisfied('EOD', new Date('2026-01-01T16:59:59'))).toBe(false)
  })

  it('HH:MM: true when current hour matches', () => {
    expect(isAtSatisfied('09:00', new Date('2026-01-01T09:45:00'))).toBe(true)
  })

  it('HH:MM: true for single-digit hour format', () => {
    expect(isAtSatisfied('9:00', new Date('2026-01-01T09:30:00'))).toBe(true)
  })

  it('HH:MM: false when current hour differs', () => {
    expect(isAtSatisfied('09:00', new Date('2026-01-01T10:00:00'))).toBe(false)
  })

  it('unknown at string is treated as always satisfied', () => {
    expect(isAtSatisfied('not-a-time', new Date())).toBe(true)
  })
})

// ── isProjectDue ──────────────────────────────────────────────────────────────

describe('isProjectDue', () => {
  it('returns false when runEvery is never', () => {
    expect(isProjectDue({ ...baseProject, runEvery: 'never' }, new Date())).toBe(false)
  })

  it('returns true when project has never run', () => {
    const p = { ...baseProject, runEvery: 'daily' as const }
    delete (p as VaultProject & { lastRun?: string }).lastRun
    expect(isProjectDue(p, new Date())).toBe(true)
  })

  it('returns false when run moments ago', () => {
    const p = { ...baseProject, lastRun: new Date().toISOString() }
    expect(isProjectDue(p, new Date())).toBe(false)
  })

  it('returns true after daily interval elapsed', () => {
    const lastRun = new Date(Date.now() - 86_400_001).toISOString()
    expect(isProjectDue({ ...baseProject, lastRun }, new Date())).toBe(true)
  })

  it('returns false before daily interval elapsed', () => {
    const lastRun = new Date(Date.now() - 3_600_000).toISOString() // 1h ago
    expect(isProjectDue({ ...baseProject, lastRun }, new Date())).toBe(false)
  })

  it('returns false within weekly interval', () => {
    const lastRun = new Date(Date.now() - 3_600_000).toISOString()
    const p = { ...baseProject, runEvery: 'weekly' as const, lastRun }
    expect(isProjectDue(p, new Date())).toBe(false)
  })

  it('returns true after weekly interval elapsed', () => {
    const lastRun = new Date(Date.now() - 604_800_001).toISOString()
    const p = { ...baseProject, runEvery: 'weekly' as const, lastRun }
    expect(isProjectDue(p, new Date())).toBe(true)
  })

  it('returns false for unknown runEvery value', () => {
    const p = { ...baseProject, runEvery: 'never' as const }
    expect(isProjectDue(p, new Date())).toBe(false)
  })
})

// ── getTypePolicy ─────────────────────────────────────────────────────────────

describe('getTypePolicy', () => {
  const policies: TypePolicy[] = [
    {
      tipo: 'USP',
      steps: [
        { agent: '@study', at: '09:00' },
        { agent: '@edisciplinas', at: 'EOD' },
      ],
    },
    { tipo: 'BB', steps: [{ agent: '@planner' }] },
  ]

  it('returns steps for matching tipo', () => {
    expect(getTypePolicy('USP', policies)).toEqual([
      { agent: '@study', at: '09:00' },
      { agent: '@edisciplinas', at: 'EOD' },
    ])
  })

  it('returns BB steps', () => {
    expect(getTypePolicy('BB', policies)).toEqual([{ agent: '@planner' }])
  })

  it('returns empty array when tipo not in policies', () => {
    expect(getTypePolicy('*', policies)).toEqual([])
  })

  it('returns empty array for empty policies list', () => {
    expect(getTypePolicy('USP', [])).toEqual([])
  })
})
