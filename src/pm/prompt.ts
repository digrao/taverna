import type { VaultProject, VaultAgent } from '../vault/types.js'

const PRIORITY_ICON: Record<string, string> = { high: '⬆', medium: '·', low: '⬇' }

export function buildPrompt(agent: VaultAgent, project: VaultProject, maxChars: number): string {
  const target = typeof project.raw['target'] === 'string' ? project.raw['target'] : undefined

  const pendingTasks = project.tasks
    .filter(t => t.progresso < 100)
    .slice(0, 10)

  const taskSection = pendingTasks.length > 0
    ? [
        '## Pending Tasks',
        '',
        ...pendingTasks.map(t => {
          const icon = PRIORITY_ICON[t.prioridade] ?? '·'
          const lines = [`### ${icon} ${t.id} (${t.progresso}%)`]
          if (t.body) lines.push('', t.body)
          return lines.join('\n')
        }),
        '',
      ].join('\n')
    : ''

  const header = [
    '# Agent Task',
    '',
    `**Project:** ${project.id}  `,
    `**Type:** ${project.tipo}  `,
    `**Priority:** ${project.priority}  `,
    ...(target ? [`**Target:** ${target}  `] : []),
    '',
    '## Directives',
    '',
    agent.directiveText,
    '',
    taskSection,
    '## Project Context',
    '',
  ].join('\n')

  const available = Math.max(0, maxChars - header.length)
  return header + project.content.slice(0, available)
}
