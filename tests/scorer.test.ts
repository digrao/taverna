import { describe, it, expect } from 'vitest'
import { scoreProject, rankProjects } from '../src/pm/scorer.js'
import type { VaultProject } from '../src/vault/types.js'

const now = new Date('2026-05-26T12:00:00Z')

function makeProject(overrides: Partial<VaultProject> & { id: string }): VaultProject {
  return {
    tipo: '*',
    name: overrides.id,
    filePath: `/fake/${overrides.id}.md`,
    priority: 'medium',
    runEvery: 'daily',
    runsTotal: 0,
    tasks: [],
    hasTasksFolder: false,
    hasAssetsFolder: false,
    content: '',
    raw: {},
    ...overrides,
  } as VaultProject
}

// ── scoreProject ──────────────────────────────────────────────────────────────

describe('scoreProject', () => {
  it('never-ran project gets max stale bonus', () => {
    const p = makeProject({ id: 'fresh' })
    const { score: _score, factors } = scoreProject(p, '@dev-agent', { now })
    const stale = factors.find((f) => f.name === 'stale')
    expect(stale?.points).toBe(30)
    expect(stale?.detail).toBe('never ran')
  })

  it('recently ran project gets low stale bonus', () => {
    const lastRun = new Date(now.getTime() - 2 * 86_400_000).toISOString() // 2 days ago
    const p = makeProject({ id: 'recent', lastRun })
    const { factors } = scoreProject(p, '@dev-agent', { now })
    const stale = factors.find((f) => f.name === 'stale')
    expect(stale?.points).toBe(10) // 2 days * 5 = 10
  })

  it('overdue deadline gives high score', () => {
    const p = makeProject({
      id: 'urgent',
      tasks: [
        {
          id: 't1',
          filePath: '',
          title: 'task',
          progresso: 0,
          prioridade: 'high',
          state: 'tarefinha',
          body: '',
          raw: {},
          deadline: new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10), // yesterday
        },
      ],
    })
    const { factors } = scoreProject(p, '@dev-agent', { now })
    const deadline = factors.find((f) => f.name === 'deadline')
    expect(deadline).toBeDefined()
    expect(deadline!.points).toBe(100) // max
    expect(deadline!.detail).toBe('overdue')
  })

  it('deadline 5 days away gives 60 pts', () => {
    const p = makeProject({
      id: 'near',
      tasks: [
        {
          id: 't1',
          filePath: '',
          title: 'task',
          progresso: 0,
          prioridade: 'medium',
          state: 'tarefinha',
          body: '',
          raw: {},
          deadline: new Date(now.getTime() + 5 * 86_400_000).toISOString().slice(0, 10),
        },
      ],
    })
    const { factors } = scoreProject(p, '@dev-agent', { now })
    const deadline = factors.find((f) => f.name === 'deadline')
    expect(deadline!.points).toBe(60)
  })

  it('no deadline gives no deadline factor', () => {
    const p = makeProject({ id: 'no-deadline' })
    const { factors } = scoreProject(p, '@dev-agent', { now })
    expect(factors.find((f) => f.name === 'deadline')).toBeUndefined()
  })

  it('high priority adds 20 pts', () => {
    const p = makeProject({ id: 'hipri', priority: 'high' })
    const { factors } = scoreProject(p, '@dev-agent', { now })
    const pf = factors.find((f) => f.name === 'priority')
    expect(pf?.points).toBe(20)
  })

  it('low priority adds 0 pts', () => {
    const p = makeProject({ id: 'lopri', priority: 'low' })
    const { factors } = scoreProject(p, '@dev-agent', { now })
    expect(factors.find((f) => f.name === 'priority')).toBeUndefined()
  })

  it('active pipeline tasks add 8 pts each', () => {
    const p = makeProject({
      id: 'active',
      tasks: [
        {
          id: 't1',
          filePath: '',
          title: 'a',
          progresso: 70,
          prioridade: 'high',
          state: 'em-progresso',
          body: '',
          raw: {},
          pipelineStage: 'reviewing',
        },
        {
          id: 't2',
          filePath: '',
          title: 'b',
          progresso: 50,
          prioridade: 'medium',
          state: 'em-progresso',
          body: '',
          raw: {},
          pipelineStage: 'building',
        },
      ],
    })
    const { factors } = scoreProject(p, '@dev-agent', { now })
    const af = factors.find((f) => f.name === 'active_tasks')
    expect(af?.points).toBe(16)
  })

  it('heavy deepwork this week reduces score', () => {
    const p = makeProject({ id: 'heavy', raw: { deepwork_week_h: 10 } })
    const { factors } = scoreProject(p, '@dev-agent', { now })
    const pen = factors.find((f) => f.name === 'deepwork_penalty')
    expect(pen).toBeDefined()
    expect(pen!.points).toBeLessThan(0)
  })

  it('light deepwork (<= 5h) has no penalty', () => {
    const p = makeProject({ id: 'light', raw: { deepwork_week_h: 3 } })
    const { factors } = scoreProject(p, '@dev-agent', { now })
    expect(factors.find((f) => f.name === 'deepwork_penalty')).toBeUndefined()
  })
})

// ── rankProjects ──────────────────────────────────────────────────────────────

describe('rankProjects', () => {
  it('orders by score descending', () => {
    const urgent = makeProject({
      id: 'urgent',
      tasks: [
        {
          id: 't',
          filePath: '',
          title: 'x',
          progresso: 0,
          prioridade: 'high',
          state: 'tarefinha',
          body: '',
          raw: {},
          deadline: new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10),
        },
      ],
    })
    const casual = makeProject({ id: 'casual' })

    const ranked = rankProjects([casual, urgent], { '*': '@dev-agent' }, { now })
    expect(ranked[0].project.id).toBe('urgent')
    expect(ranked[1].project.id).toBe('casual')
  })

  it('resolves agentId from agentDefaults', () => {
    const p = makeProject({ id: 'usp', tipo: 'USP' })
    const ranked = rankProjects([p], { USP: '@study-assistant', '*': '@dev-agent' }, { now })
    expect(ranked[0].agentId).toBe('@study-assistant')
  })

  it('project with agent override uses that agent', () => {
    const p = makeProject({ id: 'custom', agent: '@planner' })
    const ranked = rankProjects([p], { '*': '@dev-agent' }, { now })
    expect(ranked[0].agentId).toBe('@planner')
  })
})
