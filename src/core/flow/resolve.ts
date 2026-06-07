import { getString } from '../../vault/frontmatter.js'
import type { RawFrontmatter } from '../../vault/types.js'
import { resolveTemplate } from './template.js'
import type { FlowState } from './types.js'

/** Frontmatter sources keyed by scope name, used to resolve `infer` chains like "project > task". */
export type ScopeChain = Record<string, RawFrontmatter | undefined>

export type FieldPrompter = (field: string) => Promise<string>

export interface ResolveContext {
  state: FlowState
  frontmatter: RawFrontmatter
  scopes: ScopeChain
  /** Value for `%n` — counts existing items in the project's tasks/ at evaluation time */
  counter: number
  now?: Date
}

function resolveByScope(
  chain: string | undefined,
  field: string,
  scopes: ScopeChain,
): string | undefined {
  if (!chain) return undefined
  for (const scopeName of chain.split('>').map((s) => s.trim())) {
    if (!scopeName) continue
    const value = getString(scopes[scopeName] ?? {}, field)
    if (value !== undefined && value !== '') return value
  }
  return undefined
}

export interface ResolveResult {
  /** Resolved value for every required field, including ones already present */
  resolved: Record<string, string>
  /** Subset that had to be asked interactively */
  prompted: Record<string, string>
}

/**
 * Resolves every required field of the destination state in declaration order:
 * already-set → infer (scope chain) → default (template) → interactive prompt.
 */
export async function resolveRequiredFields(
  ctx: ResolveContext,
  prompt: FieldPrompter,
): Promise<ResolveResult> {
  const resolved: Record<string, string> = {}
  const prompted: Record<string, string> = {}
  const now = ctx.now ?? new Date()

  for (const field of ctx.state.required) {
    const existing = getString(ctx.frontmatter, field)
    if (existing !== undefined && existing !== '') {
      resolved[field] = existing
      continue
    }

    const inferred = resolveByScope(ctx.state.infer[field], field, ctx.scopes)
    if (inferred !== undefined) {
      resolved[field] = inferred
      continue
    }

    const template = ctx.state.default[field]
    if (template !== undefined) {
      resolved[field] = resolveTemplate(template, {
        now,
        counter: ctx.counter,
        frontmatter: ctx.frontmatter,
      })
      continue
    }

    const value = await prompt(field)
    resolved[field] = value
    prompted[field] = value
  }

  return { resolved, prompted }
}
