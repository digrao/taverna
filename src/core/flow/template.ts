import { getString } from '../../vault/frontmatter.js'
import type { RawFrontmatter } from '../../vault/types.js'

export interface TemplateContext {
  now: Date
  /** Sequential counter within the project — only meaningful for `%n` */
  counter: number
  frontmatter: RawFrontmatter
}

const STRFTIME: Record<string, (now: Date) => string> = {
  Y: (d) => String(d.getFullYear()),
  m: (d) => String(d.getMonth() + 1).padStart(2, '0'),
  d: (d) => String(d.getDate()).padStart(2, '0'),
  H: (d) => String(d.getHours()).padStart(2, '0'),
  M: (d) => String(d.getMinutes()).padStart(2, '0'),
  S: (d) => String(d.getSeconds()).padStart(2, '0'),
}

const FIELD_RE = /\{\{\s*([^|}]+?)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g
const SEQUENCE_RE = /%(.)/g

/**
 * Resolves a `default` template string against an item's frontmatter.
 * Supports `%n` (sequential counter), a strftime subset (%Y %m %d %H %M %S),
 * and Handlebars-style `{{field}}` / `{{field|fallback}}` — see Template-Language wiki page.
 * Unknown `%x` sequences are left as-is.
 */
export function resolveTemplate(template: string, ctx: TemplateContext): string {
  let result = template.replace(FIELD_RE, (_match, field: string, fallback?: string) => {
    const value = getString(ctx.frontmatter, field)
    if (value !== undefined && value !== '') return value
    return fallback ?? ''
  })

  result = result.replace(SEQUENCE_RE, (match, code: string) => {
    if (code === '%') return '%'
    if (code === 'n') return String(ctx.counter)
    const fn = STRFTIME[code]
    return fn ? fn(ctx.now) : match
  })

  return result
}
