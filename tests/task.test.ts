import { describe, it, expect } from 'vitest'
import { resolveDependency, isBlocked, hasCycle } from '../src/vault/task.js'
import type { VaultTask } from '../src/vault/types.js'

function makeTask(id: string, progresso: number, depends?: string[]): VaultTask {
  return {
    id,
    filePath: `/fake/tasks/${id}.md`,
    title: id,
    progresso,
    prioridade: 'medium',
    state: progresso === 100 ? 'concluida' : 'tarefinha',
    body: '',
    raw: {},
    ...(depends && depends.length > 0 ? { depends } : {}),
  }
}

// ── resolveDependency ─────────────────────────────────────────────────────────

describe('resolveDependency', () => {
  const tasks = [
    makeTask('07-scheduler-module', 100),
    makeTask('13-http-status-server', 30),
    makeTask('22-task-dependency-support', 0),
  ]

  it('matches by full ID', () => {
    expect(resolveDependency('07-scheduler-module', tasks)?.id).toBe('07-scheduler-module')
  })

  it('matches by numeric prefix', () => {
    expect(resolveDependency('07', tasks)?.id).toBe('07-scheduler-module')
  })

  it('matches 13 by prefix', () => {
    expect(resolveDependency('13', tasks)?.id).toBe('13-http-status-server')
  })

  it('returns undefined when not found', () => {
    expect(resolveDependency('99', tasks)).toBeUndefined()
  })

  it('returns undefined for empty list', () => {
    expect(resolveDependency('07', [])).toBeUndefined()
  })
})

// ── isBlocked ─────────────────────────────────────────────────────────────────

describe('isBlocked', () => {
  it('task with no dependencies is not blocked', () => {
    const task = makeTask('22-task', 0)
    expect(isBlocked(task, [task]).blocked).toBe(false)
  })

  it('task with empty depends array is not blocked', () => {
    const task = makeTask('22-task', 0, [])
    expect(isBlocked(task, [task]).blocked).toBe(false)
  })

  it('task with dependency at 100% is not blocked', () => {
    const dep = makeTask('07-dep', 100)
    const task = makeTask('22-task', 0, ['07'])
    expect(isBlocked(task, [dep, task]).blocked).toBe(false)
  })

  it('task with dependency at partial progress is blocked', () => {
    const dep = makeTask('13-dep', 30)
    const task = makeTask('22-task', 0, ['13'])
    const result = isBlocked(task, [dep, task])
    expect(result.blocked).toBe(true)
    expect(result.blockedBy).toContain('13')
  })

  it('task with dependency at 0% is blocked', () => {
    const dep = makeTask('07-dep', 0)
    const task = makeTask('22-task', 0, ['07'])
    expect(isBlocked(task, [dep, task]).blocked).toBe(true)
  })

  it('unknown dep ID is assumed satisfied (archived)', () => {
    const task = makeTask('22-task', 0, ['archived-dep'])
    const result = isBlocked(task, [task])
    expect(result.blocked).toBe(false)
  })

  it('blockedBy lists only unsatisfied dep IDs', () => {
    const dep1 = makeTask('07-dep', 100)
    const dep2 = makeTask('13-dep', 30)
    const task = makeTask('22-task', 0, ['07', '13'])
    const result = isBlocked(task, [dep1, dep2, task])
    expect(result.blockedBy).toEqual(['13'])
  })

  it('task with multiple unsatisfied deps lists all in blockedBy', () => {
    const dep1 = makeTask('07-dep', 50)
    const dep2 = makeTask('13-dep', 0)
    const task = makeTask('22-task', 0, ['07', '13'])
    const result = isBlocked(task, [dep1, dep2, task])
    expect(result.blockedBy).toEqual(['07', '13'])
  })
})

// ── hasCycle ──────────────────────────────────────────────────────────────────

describe('hasCycle', () => {
  it('returns false for tasks with no dependencies', () => {
    const tasks = [makeTask('01', 0), makeTask('02', 0)]
    expect(hasCycle(tasks)).toBe(false)
  })

  it('returns false for linear dependency chain', () => {
    const tasks = [makeTask('01', 0), makeTask('02', 0, ['01'])]
    expect(hasCycle(tasks)).toBe(false)
  })

  it('returns false for diamond dependency (no cycle)', () => {
    const tasks = [
      makeTask('01', 100),
      makeTask('02', 0, ['01']),
      makeTask('03', 0, ['01']),
      makeTask('04', 0, ['02', '03']),
    ]
    expect(hasCycle(tasks)).toBe(false)
  })

  it('returns true for direct circular dependency', () => {
    const tasks = [makeTask('01', 0, ['02']), makeTask('02', 0, ['01'])]
    expect(hasCycle(tasks)).toBe(true)
  })

  it('returns true for three-node cycle', () => {
    const tasks = [
      makeTask('01', 0, ['03']),
      makeTask('02', 0, ['01']),
      makeTask('03', 0, ['02']),
    ]
    expect(hasCycle(tasks)).toBe(true)
  })

  it('returns false when dep ID resolves to nothing (no self-loop)', () => {
    const tasks = [makeTask('01', 0, ['missing'])]
    expect(hasCycle(tasks)).toBe(false)
  })
})
