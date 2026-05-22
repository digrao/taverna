import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'

interface CostEntry {
  date: string
  project: string
  agent: string
  cost_usd: number
  ts: string
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
  try { return JSON.parse(readFileSync(p, 'utf8')) as CostEntry[] } catch { return [] }
}

function writeLedger(vaultPath: string, entries: CostEntry[]): void {
  const p = ledgerPath(vaultPath)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(entries, null, 2))
}

export function recordCost(vaultPath: string, project: string, agent: string, cost_usd: number): void {
  const entries = readLedger(vaultPath)
  entries.push({ date: today(), project, agent, cost_usd, ts: new Date().toISOString() })
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 90)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  writeLedger(vaultPath, entries.filter(e => e.date >= cutoffStr))
}

export function getDailyCosts(vaultPath: string): Record<string, number> {
  const t = today()
  const out: Record<string, number> = {}
  for (const e of readLedger(vaultPath).filter(e => e.date === t)) {
    out[e.project] = (out[e.project] ?? 0) + e.cost_usd
  }
  return out
}

export interface BudgetCheck { allowed: boolean; spent: number; limit?: number }

export function checkBudget(vaultPath: string, project: string, limitUsd?: number): BudgetCheck {
  const costs = getDailyCosts(vaultPath)
  const spent = costs[project] ?? 0
  if (limitUsd === undefined) return { allowed: true, spent }
  return { allowed: spent < limitUsd, spent, limit: limitUsd }
}
