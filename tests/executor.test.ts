import { describe, it, expect } from 'vitest'
import { buildPrompt } from '../src/pm/prompt.js'
import { parseResultado, runAgent } from '../src/pm/executor.js'
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

  it('truncates content to maxChars', () => {
    const maxChars = 200
    const prompt = buildPrompt(mockAgent, mockProject, maxChars)
    expect(prompt.length).toBeLessThanOrEqual(maxChars)
  })

  it('includes project type in header', () => {
    const prompt = buildPrompt(mockAgent, mockProject, 8000)
    expect(prompt).toContain('Type: *')
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
})
