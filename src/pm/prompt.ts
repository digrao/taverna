import type { VaultProject, VaultAgent, VaultTask } from '../vault/types.js'

const PRIORITY_ICON: Record<string, string> = { high: '⬆', medium: '·', low: '⬇' }

// Resolves "jvcm@start:some/path" → "/home/jvcm/some/path"
// Resolves "user@host:path" → "/home/user/path" (generic form)
export function resolveTarget(raw: string): string {
  const m = raw.match(/^(\w+)@\w+:(.+)$/)
  if (m) return `/home/${m[1]}/${m[2]}`
  return raw
}

function renderTask(t: VaultTask): string {
  const icon = PRIORITY_ICON[t.prioridade] ?? '·'
  const lines = [`### ${icon} ${t.id} (${t.progresso}%)`]
  if (t.body) lines.push('', t.body)
  return lines.join('\n')
}

export function buildPrompt(agent: VaultAgent, project: VaultProject, maxChars: number): string {
  const rawTarget = typeof project.raw['target'] === 'string' ? project.raw['target'] : undefined
  const target = rawTarget ? resolveTarget(rawTarget) : undefined

  const pending = project.tasks.filter(t => t.progresso < 100)

  // Build the static sections first to know how much budget remains
  const meta = [
    '# Agent Task',
    '',
    `**Project:** ${project.id}`,
    `**Type:** ${project.tipo}`,
    `**Priority:** ${project.priority}`,
    ...(target ? [`**Target:** ${target}`] : []),
    '',
    '## Directives',
    '',
    agent.directiveText,
    '',
  ].join('\n')

  // Reserve at least 800 chars for project context
  const CONTEXT_RESERVE = 800
  let taskBudget = maxChars - meta.length - CONTEXT_RESERVE

  // Include pending tasks from the top, stopping when the budget runs out
  const includedTasks: string[] = []
  let omitted = 0
  for (const t of pending) {
    const rendered = renderTask(t)
    if (taskBudget - rendered.length - 1 >= 0) {
      includedTasks.push(rendered)
      taskBudget -= rendered.length + 1
    } else {
      omitted++
    }
  }

  const taskSection = includedTasks.length > 0
    ? [
        '## Pending Tasks',
        '',
        ...includedTasks,
        ...(omitted > 0 ? [`\n_…${omitted} more task(s) not shown — check tasks/ folder_`] : []),
        '',
      ].join('\n')
    : ''

  const fixedPart = meta + taskSection

  const CONTEXT_HEADER = '## Project Context\n\n'
  const contextBudget = Math.max(0, maxChars - fixedPart.length - CONTEXT_HEADER.length)
  const contextSlice = project.content.slice(0, contextBudget)
  const contextSection = contextSlice ? CONTEXT_HEADER + contextSlice : ''

  return fixedPart + contextSection
}
