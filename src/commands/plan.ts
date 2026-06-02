import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CommandDef, TavernaContext } from './types.js'
import { scanVault } from '../vault/index.js'
import { computeHealth } from '../pm/observability/index.js'

const PRIO_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }
const HEALTH_ICON: Record<string, string> = {
  ok: '🟢',
  'at-risk': '🟡',
  overdue: '🔴',
  idle: '⚪',
}

export async function generateAgenda(
  _params: Record<string, unknown>,
  ctx: TavernaContext,
): Promise<{ markdown: string; outPath?: string }> {
  const vault = await scanVault(ctx.config)
  const sorted = [...vault.projects].sort(
    (a, b) => (PRIO_ORDER[a.priority] ?? 1) - (PRIO_ORDER[b.priority] ?? 1),
  )

  const dateStr = new Date().toISOString().split('T')[0]
  const lines: string[] = [
    `# STATUS — ${dateStr}`,
    '',
    `_${vault.projects.length} projetos · gerado por \`taverna agenda\`_`,
    '',
  ]

  for (const project of sorted) {
    const snap = computeHealth(project)
    const pending = project.tasks.filter((t) => t.progresso < 100)
    const icon = HEALTH_ICON[snap.health] ?? '⚪'
    const prio =
      project.priority === 'high' ? '[HIGH]' : project.priority === 'medium' ? '[MED]' : '[LOW]'
    lines.push(`## ${icon} ${prio} ${project.id} (${project.tipo})`)

    if (snap.deadline_days !== undefined) {
      const dl =
        snap.deadline_days < 0
          ? `${Math.abs(snap.deadline_days)}d atrasado`
          : `${snap.deadline_days}d`
      lines.push(`_deadline: ${dl} · progresso: ${snap.progresso}%_`)
    } else if (snap.progresso > 0) {
      lines.push(`_progresso: ${snap.progresso}%_`)
    }

    if (pending.length === 0) {
      lines.push('_sem tasks pendentes_')
    } else {
      for (const t of pending.slice(0, 5)) {
        const pct = t.progresso > 0 ? ` (${t.progresso}%)` : ''
        const blocked = t.bloqueio ? ` ⚠ ${t.bloqueio}` : ''
        const waiting = t.requerHumano?.length ? ` 👤 aguardando humano` : ''
        lines.push(`- [ ] ${t.title}${pct}${blocked}${waiting}`)
      }
      if (pending.length > 5) lines.push(`- _…mais ${pending.length - 5} task(s)_`)
    }
    lines.push('')
  }

  const markdown = lines.join('\n')

  if (!ctx.dryRun) {
    const outPath = join(ctx.vaultPath, 'STATUS.md')
    await writeFile(outPath, markdown, 'utf8')
    return { markdown, outPath }
  }

  return { markdown }
}

export const planCommands: CommandDef[] = [
  {
    id: 'agenda',
    description: 'Aggregate pending tasks across all projects and write STATUS.md to vault root',
    params: {},
    handler: (_, ctx) => generateAgenda({}, ctx),
  },
]
