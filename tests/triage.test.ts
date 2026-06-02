import { describe, it, expect } from 'vitest'
import { triage } from '../src/manager/scheduling/triage.js'
import type { VaultTask, VaultProject } from '../src/vault/types.js'

function makeTask(overrides: Partial<VaultTask> = {}): VaultTask {
  return {
    id: 'T01',
    filePath: '/fake/tasks/T01.md',
    title: 'Some task',
    progresso: 0,
    prioridade: 'medium',
    state: 'backlog',
    body: '',
    raw: {},
    ...overrides,
  }
}

function makeProject(tasks: VaultTask[]): VaultProject {
  return {
    id: 'PROJ',
    tipo: '*',
    name: 'Project',
    filePath: '/fake/PROJ.md',
    priority: 'medium',
    runEvery: 'daily',
    runsTotal: 0,
    tasks,
    hasTasksFolder: true,
    hasAssetsFolder: false,
    content: '',
    raw: {},
  }
}

describe('triage', () => {
  it('passes through unblocked pending tasks', () => {
    const task = makeTask({ id: 'T01' })
    const project = makeProject([task])
    const result = triage([task], project)
    expect(result.canRun).toBe(true)
    expect(result.runnable).toHaveLength(1)
    expect(result.skipped).toHaveLength(0)
  })

  it('skips tasks with progresso >= 100', () => {
    const task = makeTask({ id: 'T01', progresso: 100 })
    const project = makeProject([task])
    const result = triage([task], project)
    expect(result.canRun).toBe(false)
    expect(result.runnable).toHaveLength(0)
    expect(result.skipped[0]?.reason).toMatch(/conclu/i)
  })

  it('skips tasks with bloqueio set', () => {
    const task = makeTask({ id: 'T01', bloqueio: 'aguardando resposta do servidor' })
    const project = makeProject([task])
    const result = triage([task], project)
    expect(result.canRun).toBe(false)
    expect(result.skipped[0]?.reason).toMatch(/bloqueio/i)
  })

  it('skips tasks with requerHumano', () => {
    const task = makeTask({ id: 'T01', requerHumano: ['aprovação do João'] })
    const project = makeProject([task])
    const result = triage([task], project)
    expect(result.canRun).toBe(false)
    expect(result.skipped[0]?.reason).toMatch(/humano/i)
  })

  it('skips tasks whose dependencies are not complete', () => {
    const dep = makeTask({ id: 'T00', progresso: 50 })
    const task = makeTask({ id: 'T01', depends: ['T00'] })
    const project = makeProject([dep, task])
    const result = triage([task], project)
    expect(result.canRun).toBe(false)
    expect(result.skipped[0]?.reason).toMatch(/T00/i)
  })

  it('allows task when its dependency is complete', () => {
    const dep = makeTask({ id: 'T00', progresso: 100 })
    const task = makeTask({ id: 'T01', depends: ['T00'] })
    const project = makeProject([dep, task])
    const result = triage([task], project)
    expect(result.canRun).toBe(true)
    expect(result.runnable).toHaveLength(1)
  })

  it('returns canRun false when all tasks are filtered', () => {
    const t1 = makeTask({ id: 'T01', progresso: 100 })
    const t2 = makeTask({ id: 'T02', bloqueio: 'erro' })
    const project = makeProject([t1, t2])
    const result = triage([t1, t2], project)
    expect(result.canRun).toBe(false)
    expect(result.skipped).toHaveLength(2)
  })

  it('separates runnable from skipped in mixed list', () => {
    const ok = makeTask({ id: 'T01', progresso: 10 })
    const done = makeTask({ id: 'T02', progresso: 100 })
    const project = makeProject([ok, done])
    const result = triage([ok, done], project)
    expect(result.runnable.map((t) => t.id)).toEqual(['T01'])
    expect(result.skipped.map((e) => e.task.id)).toEqual(['T02'])
  })
})
