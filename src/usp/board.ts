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

function _formatNextRun(s: number | undefined): string {
  if (s === undefined) return '—'
  if (s <= 0) return 'agora'
  const h = Math.floor(s / 3600)
  if (h < 1) return `${Math.floor(s / 60)}min`
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function formatTaskBreakdown(p: VaultProject): { aulas: string; entregas: string } {
  const aulas = p.tasks.filter((t) => t.taskType === 'USP-aula')
  const entregas = p.tasks.filter((t) => t.taskType === 'USP-entrega')
  const generic = p.tasks.filter((t) => t.taskType === undefined)

  if (aulas.length === 0 && entregas.length === 0) {
    // Legacy tasks without type — show total
    const done = generic.filter((t) => t.progresso === 100).length
    return { aulas: '—', entregas: `${done}/${generic.length}` }
  }

  const aulasDone = aulas.filter((t) => t.pipelineStage === 'done').length
  const entregasDone = entregas.filter(
    (t) => t.pipelineStage === 'submitted' || t.pipelineStage === 'graded',
  ).length
  // Show blocker indicator: aulas not done that block a pending entrega
  const pendingEntregas = entregas.filter(
    (t) => t.pipelineStage !== 'submitted' && t.pipelineStage !== 'graded',
  )
  const blocked = pendingEntregas.some((e) =>
    (e.depends ?? []).some((depId) =>
      aulas.find((a) => a.id === depId && a.pipelineStage !== 'done'),
    ),
  )
  const blockIndicator = blocked ? ' ⚠' : ''

  return {
    aulas: `${aulasDone}/${aulas.length}`,
    entregas: `${entregasDone}/${entregas.length}${blockIndicator}`,
  }
}

export function generateBoardBlock(uspProjects: VaultProject[], generatedAt: Date): string {
  const rows = uspProjects
    .map((p) => ({ p, snap: computeHealth(p) }))
    .sort((a, b) => {
      const order = { overdue: 0, 'at-risk': 1, ok: 2, idle: 3 }
      return (order[a.snap.health] ?? 9) - (order[b.snap.health] ?? 9)
    })
    .map(({ p, snap }) => {
      const icon = HEALTH_ICON[snap.health] ?? '⚪'
      const prio = PRIORITY_ICON[snap.priority] ?? '·'
      const deadline = formatDeadline(snap.deadline_days)
      const lastRun = p.lastRun
        ? new Date(p.lastRun).toLocaleString('pt-BR', {
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '—'
      const { aulas, entregas } = formatTaskBreakdown(p)
      return `| ${icon} ${p.id} | ${prio} ${snap.priority} | ${aulas} | ${entregas} | ${deadline} | ${lastRun} |`
    })

  const header = `| Matéria | Prioridade | Aulas ✓ | Entregas | Deadline | Último run |`
  const separator = `|---------|-----------|---------|----------|----------|-----------|`
  const tableLines = [header, separator, ...rows]

  return [
    BOARD_START,
    `_Atualizado: ${generatedAt.toLocaleString('pt-BR')}_`,
    '',
    tableLines.join('\n'),
    BOARD_END,
  ].join('\n')
}

export async function updateBoardFile(
  filePath: string,
  uspProjects: VaultProject[],
): Promise<void> {
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
