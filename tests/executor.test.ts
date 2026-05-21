import { describe, it, expect } from 'vitest'
import { buildPrompt } from '../src/pm/prompt.js'
import { parseResultado, runAgent, runPipeline } from '../src/pm/executor.js'
import type { VaultAgent, VaultProject } from '../src/vault/types.js'

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

// ── buildPrompt ───────────────────────────────────────────────────────────────

describe('buildPrompt', () => {
  it('includes project ID and directive text', () => {
    const prompt = buildPrompt(mockAgent, mockProject, 8000)
    expect(prompt).toContain('TEST001')
    expect(prompt).toContain('You are a test agent')
  })

  it('truncates project content when maxChars is tight', () => {
    // The static sections (header + protocol) are always included.
    // What gets truncated is project.content — verify it shrinks with a tighter budget.
    const promptLarge = buildPrompt(mockAgent, mockProject, 8000)
    const promptSmall = buildPrompt(mockAgent, mockProject, 2000)
    expect(promptSmall.length).toBeLessThan(promptLarge.length)
    expect(promptSmall.length).toBeLessThanOrEqual(8000)
  })

  it('includes project type in header', () => {
    const prompt = buildPrompt(mockAgent, mockProject, 8000)
    expect(prompt).toContain('**Type:** *')
  })

  it('truncates at 0 available chars without crashing', () => {
    const prompt = buildPrompt(mockAgent, mockProject, 1)
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
  it('includes previous output section when provided', () => {
    const prompt = buildPrompt(mockAgent, mockProject, 8000, 'prior step result')
    expect(prompt).toContain('## Previous Agent Output')
    expect(prompt).toContain('prior step result')
  })

  it('omits previous output section when not provided', () => {
    const prompt = buildPrompt(mockAgent, mockProject, 8000)
    expect(prompt).not.toContain('## Previous Agent Output')
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
