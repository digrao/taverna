import type { VaultProject, VaultAgent, VaultTask } from '../vault/types.js'

const PRIORITY_ICON: Record<string, string> = { high: '⬆', medium: '·', low: '⬇' }

// Resolves "jvcm@start:some/path" → "/home/jvcm/some/path"
export function resolveTarget(raw: string): string {
  const m = raw.match(/^(\w+)@\w+:(.+)$/)
  if (m) return `/home/${m[1]}/${m[2]}`
  return raw
}

function renderTask(t: VaultTask): string {
  const icon = PRIORITY_ICON[t.prioridade] ?? '·'
  const lines = [
    `### ${icon} ${t.id} (${t.progresso}%)`,
    `_file: ${t.filePath}_`,
  ]
  if (t.body) lines.push('', t.body)
  return lines.join('\n')
}

const COMPLETION_PROTOCOL = `\
## Task Completion Protocol

This applies to every agent after finishing work on a task:

1. **Update task file** — set \`progresso:\` to \`100\` (done) or an intermediate value (partial).
   Edit the frontmatter of the task file shown in \`_file: <path>_\` above.

2. **Archive if done** — if \`progresso: 100\`, move the file:
   \`mv tasks/<id>.md tasks/archive/<id>.md\`

3. **Logbook** — append an entry to the project's \`logbook.md\` in the vault project folder
   (NOT in the code repo). The vault project folder is the parent of the \`tasks/\` directory.

   \`\`\`markdown
   ## YYYY-MM-DD HH:MM — <task-id>
   - Status: CONCLUÍDA | BLOQUEADA | PARCIAL
   - Arquivos: <list>
   - Testes: N passed (0 failed)
   - Próximo: <next task or manual action needed>
   \`\`\`

4. **RESULTADO line** — always end your response with:
   \`RESULTADO: <summary of what was done>\`
`

export function buildPrompt(agent: VaultAgent, project: VaultProject, maxChars: number, previousOutput?: string): string {
  const rawTarget = typeof project.raw['target'] === 'string' ? project.raw['target'] : undefined
  const target = rawTarget ? resolveTarget(rawTarget) : undefined

  const pending = project.tasks.filter(t => t.progresso < 100)

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
    COMPLETION_PROTOCOL,
    '',
    ...(previousOutput ? ['## Previous Agent Output', '', previousOutput, ''] : []),
  ].join('\n')

  // Reserve space for project context
  const CONTEXT_RESERVE = 800
  let taskBudget = maxChars - meta.length - CONTEXT_RESERVE

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
