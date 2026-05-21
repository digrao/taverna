import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import type { VaultProject } from '../vault/types.js'
import { computeHealth } from '../pm/loki.js'

const BOARD_START = '<!-- usp-board:start -->'
const BOARD_END = '<!-- usp-board:end -->'

const HEALTH_ICON: Record<string, string> = {
  ok: '🟢',
  'at-risk': '🟡',
  overdue: '🔴',
  idle: '⚪',
}

const PRIORITY_ICON: Record<string, string> = {
  high: '⬆',
  medium: '·',
  low: '⬇',
}

function formatDeadline(days: number | undefined): string {
  if (days === undefined) return '—'
  if (days < 0) return `${Math.abs(days)}d atrasado`
  if (days === 0) return 'hoje'
  return `${days}d`
}

function formatNextRun(s: number | undefined): string {
  if (s === undefined) return '—'
  if (s <= 0) return 'agora'
  const h = Math.floor(s / 3600)
  if (h < 1) return `${Math.floor(s / 60)}min`
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function generateBoardBlock(uspProjects: VaultProject[], generatedAt: Date): string {
  const rows = uspProjects
    .map(p => ({ p, snap: computeHealth(p) }))
    .sort((a, b) => {
      const order = { overdue: 0, 'at-risk': 1, ok: 2, idle: 3 }
      return (order[a.snap.health] ?? 9) - (order[b.snap.health] ?? 9)
    })
    .map(({ p, snap }) => {
      const icon = HEALTH_ICON[snap.health] ?? '⚪'
      const prio = PRIORITY_ICON[snap.priority] ?? '·'
      const deadline = formatDeadline(snap.deadline_days)
      const nextRun = formatNextRun(typeof snap.next_run_in_s === 'number' ? snap.next_run_in_s : undefined)
      const lastRun = p.lastRun
        ? new Date(p.lastRun).toLocaleString('pt-BR', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        : '—'
      return `| ${icon} ${p.id} | ${prio} ${snap.priority} | ${snap.progresso}% | ${snap.tasks_done}/${snap.tasks_total} | ${deadline} | ${lastRun} | ${nextRun} |`
    })

  const header = `| Matéria | Prioridade | Progresso | Tasks | Deadline | Último run | Próximo run |`
  const separator = `|---------|-----------|-----------|-------|----------|-----------|------------|`
  const tableLines = [header, separator, ...rows]

  return [
    BOARD_START,
    `_Atualizado: ${generatedAt.toLocaleString('pt-BR')}_`,
    '',
    tableLines.join('\n'),
    BOARD_END,
  ].join('\n')
}

export async function updateBoardFile(filePath: string, uspProjects: VaultProject[]): Promise<void> {
  const block = generateBoardBlock(uspProjects, new Date())

  if (!existsSync(filePath)) {
    await writeFile(filePath, block + '\n', 'utf8')
    return
  }

  const content = await readFile(filePath, 'utf8')
  const startIdx = content.indexOf(BOARD_START)
  const endIdx = content.indexOf(BOARD_END)

  if (startIdx !== -1 && endIdx !== -1) {
    const before = content.slice(0, startIdx)
    const after = content.slice(endIdx + BOARD_END.length)
    await writeFile(filePath, before + block + after, 'utf8')
  } else {
    await writeFile(filePath, content.trimEnd() + '\n\n' + block + '\n', 'utf8')
  }
}
