import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { emitEvent } from './event-bus.js'
import matter from 'gray-matter'

interface TokenCounts {
  in: number
  out: number
  cache_read: number
  cache_fill: number
}

interface CostEntry {
  date: string
  project: string
  agent: string
  cost_usd: number
  tokens: TokenCounts
  ts: string
}

export interface BudgetConfig {
  tokens_daily?: number
  usd_daily?: number
  warn_at_pct?: number
}

export interface BudgetCheck {
  allowed: boolean
  spent_tokens: number
  spent_usd: number
  limit_tokens?: number
  limit_usd?: number
  pct?: number
}

export interface ProjectBudgetStatus {
  id: string
  spent_tokens: number
  spent_usd: number
  limit_tokens?: number
  pct?: number
}

export interface BudgetStatus {
  global: {
    spent_tokens: number
    spent_usd: number
    limit_tokens?: number
    pct?: number
  }
  projects: ProjectBudgetStatus[]
}

function ledgerPath(vaultPath: string): string {
  return join(vaultPath, '60_Agents', '4_Config', 'costs.json')
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function readLedger(vaultPath: string): CostEntry[] {
  const p = ledgerPath(vaultPath)
  if (!existsSync(p)) return []
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as CostEntry[]
  } catch {
    return []
  }
}

function writeLedger(vaultPath: string, entries: CostEntry[]): void {
  const p = ledgerPath(vaultPath)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(entries, null, 2))
}

function totalTokens(tokens: TokenCounts | undefined): number {
  if (!tokens) return 0
  return (tokens.in ?? 0) + (tokens.out ?? 0) + (tokens.cache_read ?? 0) + (tokens.cache_fill ?? 0)
}

export function loadVaultBudgetConfig(_vaultPath: string): BudgetConfig {
  const configPath = join(
    dirname(new URL(import.meta.url).pathname),
    '..',
    '..',
    'taverna.config.yaml',
  )
  if (!existsSync(configPath)) return {}
  try {
    const raw = readFileSync(configPath, 'utf8')
    const parsed = matter(`---\n${raw}\n---`).data
    const budget = parsed['budget']
    if (!budget || typeof budget !== 'object') return {}
    const cfg: BudgetConfig = {}
    if (typeof budget['global_tokens_daily'] === 'number')
      cfg.tokens_daily = budget['global_tokens_daily']
    if (typeof budget['warn_at_pct'] === 'number') cfg.warn_at_pct = budget['warn_at_pct']
    return cfg
  } catch {
    return {}
  }
}

export function recordCost(
  vaultPath: string,
  project: string,
  agent: string,
  cost_usd: number,
  tokens?: TokenCounts,
): void {
  const entries = readLedger(vaultPath)
  entries.push({
    date: today(),
    project,
    agent,
    cost_usd,
    tokens: tokens ?? { in: 0, out: 0, cache_read: 0, cache_fill: 0 },
    ts: new Date().toISOString(),
  })
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 90)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  writeLedger(
    vaultPath,
    entries.filter((e) => e.date >= cutoffStr),
  )
}

export function getDailyCosts(vaultPath: string): Record<string, number> {
  const t = today()
  const out: Record<string, number> = {}
  for (const e of readLedger(vaultPath).filter((e) => e.date === t)) {
    out[e.project] = (out[e.project] ?? 0) + e.cost_usd
  }
  return out
}

// project = '__global__' aggregates all projects for the current day
export function checkBudget(vaultPath: string, project: string, config: BudgetConfig): BudgetCheck {
  const t = today()
  const allToday = readLedger(vaultPath).filter((e) => e.date === t)
  const entries =
    project === '__global__' ? allToday : allToday.filter((e) => e.project === project)

  const spent_usd = entries.reduce((s, e) => s + e.cost_usd, 0)
  const spent_tokens = entries.reduce((s, e) => s + totalTokens(e.tokens), 0)
  const warnAt = config.warn_at_pct ?? 80

  if (config.tokens_daily !== undefined) {
    const pct = Math.round((spent_tokens / config.tokens_daily) * 100)
    if (spent_tokens >= config.tokens_daily) {
      emitEvent({
        event: 'budget_exceeded',
        project,
        tokens_spent: spent_tokens,
        tokens_limit: config.tokens_daily,
      })
      return { allowed: false, spent_tokens, spent_usd, limit_tokens: config.tokens_daily, pct }
    }
    if (pct >= warnAt) {
      emitEvent({
        event: 'budget_warning',
        project,
        pct_used: pct,
        tokens_spent: spent_tokens,
        tokens_limit: config.tokens_daily,
      })
    }
    return { allowed: true, spent_tokens, spent_usd, limit_tokens: config.tokens_daily, pct }
  }

  if (config.usd_daily !== undefined) {
    const pct = Math.round((spent_usd / config.usd_daily) * 100)
    if (spent_usd >= config.usd_daily) {
      emitEvent({
        event: 'budget_exceeded',
        project,
        tokens_spent: spent_tokens,
        usd_spent: spent_usd,
        usd_limit: config.usd_daily,
      })
      return { allowed: false, spent_tokens, spent_usd, limit_usd: config.usd_daily, pct }
    }
    if (pct >= warnAt) {
      emitEvent({
        event: 'budget_warning',
        project,
        pct_used: pct,
        tokens_spent: spent_tokens,
        usd_limit: config.usd_daily,
      })
    }
    return { allowed: true, spent_tokens, spent_usd, limit_usd: config.usd_daily, pct }
  }

  return { allowed: true, spent_tokens, spent_usd }
}

export function getBudgetStatus(vaultPath: string, globalConfig: BudgetConfig): BudgetStatus {
  const t = today()
  const allToday = readLedger(vaultPath).filter((e) => e.date === t)

  const globalSpentTokens = allToday.reduce((s, e) => s + totalTokens(e.tokens), 0)
  const globalSpentUsd = allToday.reduce((s, e) => s + e.cost_usd, 0)

  const byProject = new Map<string, { tokens: number; usd: number }>()
  for (const e of allToday) {
    const cur = byProject.get(e.project) ?? { tokens: 0, usd: 0 }
    cur.tokens += totalTokens(e.tokens)
    cur.usd += e.cost_usd
    byProject.set(e.project, cur)
  }

  const projects: ProjectBudgetStatus[] = Array.from(byProject.entries()).map(
    ([id, { tokens, usd }]) => ({
      id,
      spent_tokens: tokens,
      spent_usd: usd,
    }),
  )

  const global: BudgetStatus['global'] = {
    spent_tokens: globalSpentTokens,
    spent_usd: globalSpentUsd,
    ...(globalConfig.tokens_daily !== undefined
      ? {
          limit_tokens: globalConfig.tokens_daily,
          pct: Math.round((globalSpentTokens / globalConfig.tokens_daily) * 100),
        }
      : {}),
  }

  return { global, projects }
}
