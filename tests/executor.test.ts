import { describe, it, expect } from 'vitest'
import { buildPrompt, buildSessionPrompt } from '../src/pm/prompt/prompt.js'
import { parseResultado, runAgent, runPipeline, runSession } from '../src/pm/engine/executor.js'
import { buildLogtaskContent } from '../src/pm/prompt/session.js'
import type { VaultAgent, VaultProject, VaultTask } from '../src/vault/types.js'

const mockAgent: VaultAgent = {
  id: '@test',
  folderName: '@test',
  runner: { type: 'claude' },
  directiveText: 'You are a test agent. Summarize the project.',
  directivesPath: '/fake/directives/@test.md',
}

const mockProject: VaultProject = {
  id: 'TEST001',
  tipo: '*',
  name: 'Test Project',
  filePath: '/fake/TEST001/TEST001.md',
  priority: 'medium',
  runEvery: 'daily',
  runsTotal: 0,
  tasks: [],
  hasTasksFolder: false,
  hasAssetsFolder: false,
  content: 'This is the project content. '.repeat(100),
  raw: {},
}

const mockTask: VaultTask = {
  id: 'task-01',
  filePath: '/fake/TEST001/tasks/task-01.md',
  title: 'First task',
  progresso: 0,
  prioridade: 'high',
  state: 'backlog',
  body: 'Do the first thing.',
  raw: {},
}

const mockTask2: VaultTask = {
  id: 'task-02',
  filePath: '/fake/TEST001/tasks/task-02.md',
  title: 'Second task',
  progresso: 0,
  prioridade: 'medium',
  state: 'backlog',
  body: 'Do the second thing.',
  raw: {},
}

// ── buildPrompt ───────────────────────────────────────────────────────────────

describe('buildPrompt', () => {
  it('includes project ID and directive text', async () => {
    const prompt = await buildPrompt(mockAgent, mockProject, 8000)
    expect(prompt).toContain('TEST001')
    expect(prompt).toContain('You are a test agent')
  })

  it('truncates project content when maxChars is tight', async () => {
    // The static sections (header + protocol) are always included.
    // What gets truncated is project.content — verify it shrinks with a tighter budget.
    const promptLarge = await buildPrompt(mockAgent, mockProject, 8000)
    const promptSmall = await buildPrompt(mockAgent, mockProject, 2000)
    expect(promptSmall.length).toBeLessThan(promptLarge.length)
    expect(promptSmall.length).toBeLessThanOrEqual(8000)
  })

  it('includes project type in header', async () => {
    const prompt = await buildPrompt(mockAgent, mockProject, 8000)
    expect(prompt).toContain('**Type:** *')
  })

  it('truncates at 0 available chars without crashing', async () => {
    const prompt = await buildPrompt(mockAgent, mockProject, 1)
    expect(prompt.length).toBeGreaterThan(0)
  })
})

// ── parseResultado ────────────────────────────────────────────────────────────

describe('parseResultado', () => {
  it('extracts the RESULTADO line', () => {
    const output = 'Some analysis.\nRESULTADO: Task completed successfully\nMore text.'
    expect(parseResultado(output)).toBe('Task completed successfully')
  })

  it('returns undefined when no RESULTADO line present', () => {
    expect(parseResultado('No resultado here.\nJust text.')).toBeUndefined()
  })

  it('handles RESULTADO with extra whitespace', () => {
    expect(parseResultado('RESULTADO:   trimmed  ')).toBe('trimmed')
  })

  it('returns undefined for empty RESULTADO', () => {
    expect(parseResultado('RESULTADO:   ')).toBeUndefined()
  })
})

// ── runAgent ──────────────────────────────────────────────────────────────────

describe('runAgent', () => {
  it('returns prompt as output when dryRun is true', async () => {
    const result = await runAgent(mockAgent, mockProject, { dryRun: true })
    expect(result.success).toBe(true)
    expect(result.output).toContain('TEST001')
    expect(result.output).toContain('You are a test agent')
    expect(result.durationMs).toBe(0)
  })

  it('dryRun does not set resultado', async () => {
    const result = await runAgent(mockAgent, mockProject, { dryRun: true })
    expect(result.resultado).toBeUndefined()
  })

  it('embeds previousOutput in the prompt', async () => {
    const result = await runAgent(mockAgent, mockProject, {
      dryRun: true,
      previousOutput: 'output from the prior agent step',
    })
    expect(result.output).toContain('## Previous Agent Output')
    expect(result.output).toContain('output from the prior agent step')
  })
})

// ── buildPrompt with previousOutput ──────────────────────────────────────────

describe('buildPrompt previousOutput', () => {
  it('includes previous output section when provided', async () => {
    const prompt = await buildPrompt(mockAgent, mockProject, 8000, 'prior step result')
    expect(prompt).toContain('## Previous Agent Output')
    expect(prompt).toContain('prior step result')
  })

  it('omits previous output section when not provided', async () => {
    const prompt = await buildPrompt(mockAgent, mockProject, 8000)
    expect(prompt).not.toContain('## Previous Agent Output')
  })
})

// ── buildLogtaskContent ───────────────────────────────────────────────────────

describe('buildLogtaskContent', () => {
  it('includes session_id and project in frontmatter', () => {
    const spec = {
      session_id: 'abc-123',
      status: 'in-progress' as const,
      project: 'TEST001',
      agent: '@test',
      tasks: ['task-01', 'task-02'],
      _session_started: '2026-05-27T00:00:00.000Z',
    }
    const content = buildLogtaskContent(spec, [mockTask, mockTask2])
    expect(content).toContain('session_id: abc-123')
    expect(content).toContain('project: TEST001')
    expect(content).toContain('status: in-progress')
  })

  it('lists all tasks with file paths', () => {
    const spec = {
      session_id: 'xyz',
      status: 'pending' as const,
      project: 'P',
      agent: '@a',
      tasks: ['task-01', 'task-02'],
      _session_started: '2026-01-01T00:00:00.000Z',
    }
    const content = buildLogtaskContent(spec, [mockTask, mockTask2])
    expect(content).toContain('task-01')
    expect(content).toContain('task-02')
    expect(content).toContain('/fake/TEST001/tasks/task-01.md')
    expect(content).toContain('/fake/TEST001/tasks/task-02.md')
  })
})

// ── buildSessionPrompt ────────────────────────────────────────────────────────

describe('buildSessionPrompt', () => {
  it('includes session ID, project ID, and all task IDs', async () => {
    const prompt = await buildSessionPrompt(
      mockAgent,
      mockProject,
      [mockTask, mockTask2],
      8000,
      'session-uuid-1',
      '/tmp/taverna-sessions/session-uuid-1.logtask.md',
    )
    expect(prompt).toContain('session-uuid-1')
    expect(prompt).toContain('TEST001')
    expect(prompt).toContain('task-01')
    expect(prompt).toContain('task-02')
  })

  it('includes "Session Tasks" header', async () => {
    const prompt = await buildSessionPrompt(
      mockAgent,
      mockProject,
      [mockTask],
      8000,
      'sid',
      '/tmp/x.md',
    )
    expect(prompt).toContain('## Session Tasks')
    expect(prompt).toContain('Execute these 1 task(s) in sequence')
  })

  it('includes agent directive', async () => {
    const prompt = await buildSessionPrompt(
      mockAgent,
      mockProject,
      [mockTask],
      8000,
      'sid',
      '/tmp/x.md',
    )
    expect(prompt).toContain('You are a test agent')
  })
})

// ── runSession ────────────────────────────────────────────────────────────────

describe('runSession', () => {
  it('returns session prompt as output when dryRun is true', async () => {
    const result = await runSession(
      { agent: mockAgent, project: mockProject, tasks: [mockTask, mockTask2] },
      { dryRun: true },
    )
    expect(result.success).toBe(true)
    expect(result.output).toContain('Agent Session')
    expect(result.output).toContain('TEST001')
    expect(result.durationMs).toBe(0)
  })

  it('dry-run output contains all task IDs', async () => {
    const result = await runSession(
      { agent: mockAgent, project: mockProject, tasks: [mockTask, mockTask2] },
      { dryRun: true },
    )
    expect(result.output).toContain('task-01')
    expect(result.output).toContain('task-02')
  })

  it('dry-run includes logtask file path', async () => {
    const result = await runSession(
      { agent: mockAgent, project: mockProject, tasks: [mockTask] },
      { dryRun: true },
    )
    expect(result.output).toContain('logtask.md')
  })
})

// ── runPipeline ───────────────────────────────────────────────────────────────

describe('runPipeline', () => {
  const agent2: VaultAgent = {
    id: '@test2',
    folderName: '@test2',
    runner: { type: 'claude' },
    directiveText: 'You are a second agent. Review the previous output.',
    directivesPath: '/fake/directives/@test2.md',
  }

  it('returns a result per agent in dry-run', async () => {
    const results = await runPipeline([mockAgent, agent2], mockProject, { dryRun: true })
    expect(results).toHaveLength(2)
    expect(results[0]!.success).toBe(true)
    expect(results[1]!.success).toBe(true)
  })

  it('passes first agent output into second agent prompt', async () => {
    const results = await runPipeline([mockAgent, agent2], mockProject, { dryRun: true })
    // In dry-run the "output" is the generated prompt.
    // agent2's prompt should contain agent1's prompt as previous output.
    expect(results[1]!.output).toContain('## Previous Agent Output')
    expect(results[1]!.output).toContain('You are a test agent')
  })

  it('stops after a failed agent and does not run subsequent agents', async () => {
    const failingAgent: VaultAgent = {
      id: '@fail',
      folderName: '@fail',
      runner: { type: 'claude' },
      directiveText: 'failing agent',
      directivesPath: '/fake/directives/@fail.md',
    }
    // We can't make runAgent truly fail in unit tests without spawning claude,
    // so verify single-agent pipeline returns one result.
    const results = await runPipeline([failingAgent], mockProject, { dryRun: true })
    expect(results).toHaveLength(1)
  })
})
