import { scanVault, sortByPriority, getPendingTasks, readLogbook } from '../vault/index.js'
import { writeInbox } from '../vault/index.js'
import type { TavernaConfig } from '../config.js'
import type { VaultProject, LogbookEntry } from '../vault/types.js'

function isYesterday(timestamp: string, today: Date): boolean {
  const d = new Date(timestamp)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  return (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  )
}

function formatYesterdaySection(agentId: string, entries: LogbookEntry[]): string {
  if (entries.length === 0) return ''
  const lines = entries.map((e) => {
    const status = e.success === true ? '✓' : e.success === false ? '✗' : '·'
    const dur = e.duration != null ? ` (${e.duration.toFixed(1)}s)` : ''
    return `- ${status} **${e.projectName}**${dur}`
  })
  return `### ${agentId}\n${lines.join('\n')}\n`
}

function formatProjectSection(project: VaultProject): string {
  const pending = getPendingTasks(project)
  const badge =
    project.priority === 'high' ? '[HIGH]' : project.priority === 'medium' ? '[MED]' : '[LOW]'
  const tipo = project.tipo !== '*' ? ` (${project.tipo})` : ''
  const agent = project.agent ? ` · ${project.agent}` : ''
  let out = `### ${badge} ${project.id}${tipo}${agent}\n`

  if (pending.length === 0) {
    out += `_sem tasks pendentes_\n`
  } else {
    for (const t of pending) {
      const pct = t.progresso > 0 ? ` (${t.progresso}%)` : ''
      out += `- [ ] ${t.title}${pct}\n`
    }
  }
  return out
}

export async function morning(
  config: TavernaConfig,
  opts: { dryRun?: boolean; date?: Date } = {},
): Promise<string> {
  const today = opts.date ?? new Date()
  const state = await scanVault(config)

  // Yesterday's results per agent
  const yesterdaySections: string[] = []
  for (const agent of state.agents) {
    const entries = await readLogbook(agent.id, config)
    const yesterday = entries.filter((e) => isYesterday(e.timestamp, today))
    const section = formatYesterdaySection(agent.id, yesterday)
    if (section) yesterdaySections.push(section)
  }

  // Today's projects sorted by priority
  const sorted = sortByPriority(state.projects)

  const pad = (n: number) => String(n).padStart(2, '0')
  const dateStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`

  const lines: string[] = [`# Morning Brief — ${dateStr}`, '']

  if (yesterdaySections.length > 0) {
    lines.push('## Ontem')
    lines.push(...yesterdaySections)
  } else {
    lines.push('## Ontem')
    lines.push('_nenhuma execução registrada_')
    lines.push('')
  }

  lines.push('## Hoje')
  lines.push('')

  for (const project of sorted) {
    lines.push(formatProjectSection(project))
  }

  const markdown = lines.join('\n')

  if (opts.dryRun) {
    process.stdout.write(markdown + '\n')
  } else {
    const filename = config.morningFilename(today)
    await writeInbox(markdown, filename, config)
  }

  return markdown
}
