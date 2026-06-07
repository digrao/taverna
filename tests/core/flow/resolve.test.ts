import { describe, it, expect, vi } from 'vitest'
import { resolveRequiredFields } from '../../../src/core/flow/resolve.js'
import type { FlowState } from '../../../src/core/flow/types.js'

function state(overrides: Partial<FlowState> = {}): FlowState {
  return { id: '🗺️', required: [], default: {}, infer: {}, ...overrides }
}

describe('resolveRequiredFields', () => {
  it('keeps a value already present in frontmatter, skipping infer/default/prompt', async () => {
    const prompt = vi.fn()
    const result = await resolveRequiredFields(
      {
        state: state({ required: ['summary'], infer: { summary: 'project' }, default: { summary: 'x' } }),
        frontmatter: { summary: 'already set' },
        scopes: { project: { summary: 'from project' } },
        counter: 0,
      },
      prompt,
    )

    expect(result.resolved).toEqual({ summary: 'already set' })
    expect(result.prompted).toEqual({})
    expect(prompt).not.toHaveBeenCalled()
  })

  it('infers from the first scope in the chain that has a non-empty value', async () => {
    const result = await resolveRequiredFields(
      {
        state: state({ required: ['agent'], infer: { agent: 'tipo > project > task' } }),
        frontmatter: {},
        scopes: { tipo: {}, project: { agent: 'from-project' }, task: { agent: 'from-task' } },
        counter: 0,
      },
      vi.fn(),
    )

    expect(result.resolved).toEqual({ agent: 'from-project' })
  })

  it('skips scopes with empty values and unknown scope names in the chain', async () => {
    const result = await resolveRequiredFields(
      {
        state: state({ required: ['agent'], infer: { agent: 'missing > tipo > task' } }),
        frontmatter: {},
        scopes: { tipo: { agent: '' }, task: { agent: 'from-task' } },
        counter: 0,
      },
      vi.fn(),
    )

    expect(result.resolved).toEqual({ agent: 'from-task' })
  })

  it('falls back to a resolved template when nothing is set or inferable', async () => {
    const result = await resolveRequiredFields(
      {
        state: state({ required: ['title'], default: { title: '%n-{{summary|untitled}}' } }),
        frontmatter: {},
        scopes: {},
        counter: 5,
        now: new Date('2026-06-07T00:00:00'),
      },
      vi.fn(),
    )

    expect(result.resolved).toEqual({ title: '5-untitled' })
  })

  it('prompts interactively as the last resort and records the prompted value separately', async () => {
    const prompt = vi.fn().mockResolvedValue('typed by hand')
    const result = await resolveRequiredFields(
      { state: state({ required: ['summary'] }), frontmatter: {}, scopes: {}, counter: 0 },
      prompt,
    )

    expect(prompt).toHaveBeenCalledWith('summary')
    expect(result.resolved).toEqual({ summary: 'typed by hand' })
    expect(result.prompted).toEqual({ summary: 'typed by hand' })
  })

  it('resolves every required field independently and only reports the prompted subset', async () => {
    const prompt = vi.fn().mockResolvedValue('prompted-value')
    const result = await resolveRequiredFields(
      {
        state: state({
          required: ['already', 'inferred', 'defaulted', 'asked'],
          infer: { inferred: 'project' },
          default: { defaulted: 'computed' },
        }),
        frontmatter: { already: 'kept' },
        scopes: { project: { inferred: 'from-project' } },
        counter: 0,
      },
      prompt,
    )

    expect(result.resolved).toEqual({
      already: 'kept',
      inferred: 'from-project',
      defaulted: 'computed',
      asked: 'prompted-value',
    })
    expect(result.prompted).toEqual({ asked: 'prompted-value' })
    expect(prompt).toHaveBeenCalledTimes(1)
  })
})
