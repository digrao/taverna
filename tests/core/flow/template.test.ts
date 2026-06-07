import { describe, it, expect } from 'vitest'
import { resolveTemplate } from '../../../src/core/flow/template.js'

const baseCtx = { now: new Date('2026-06-07T09:05:03'), counter: 3, frontmatter: {} }

describe('resolveTemplate', () => {
  it('interpolates a frontmatter field', () => {
    const out = resolveTemplate('{{summary}}', { ...baseCtx, frontmatter: { summary: 'fix the bug' } })
    expect(out).toBe('fix the bug')
  })

  it('falls back to the pipe value when the field is missing or empty', () => {
    expect(resolveTemplate('{{summary|untitled}}', baseCtx)).toBe('untitled')
    expect(resolveTemplate('{{summary|untitled}}', { ...baseCtx, frontmatter: { summary: '' } })).toBe(
      'untitled',
    )
  })

  it('falls back to an empty string when there is no pipe and the field is missing', () => {
    expect(resolveTemplate('[{{summary}}]', baseCtx)).toBe('[]')
  })

  it('substitutes the sequential counter for %n', () => {
    expect(resolveTemplate('%n-{{summary|untitled}}', baseCtx)).toBe('3-untitled')
  })

  it('formats %Y %m %d %H %M %S against the supplied "now"', () => {
    expect(resolveTemplate('%Y-%m-%d %H:%M:%S', baseCtx)).toBe('2026-06-07 09:05:03')
  })

  it('escapes %% to a literal percent sign', () => {
    expect(resolveTemplate('100%%', baseCtx)).toBe('100%')
  })

  it('leaves unknown %x sequences untouched', () => {
    expect(resolveTemplate('%q', baseCtx)).toBe('%q')
  })

  it('combines interpolation, counter and strftime in one template', () => {
    const ctx = { ...baseCtx, frontmatter: { summary: 'ship it' } }
    expect(resolveTemplate('%Y-%m-%d %n-{{summary}}', ctx)).toBe('2026-06-07 3-ship it')
  })
})
