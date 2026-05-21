import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import type { VaultProject, VaultAgent, VaultTask } from '../vault/types.js'

const MODE_MAP: Record<string, string> = {
  vhdl: 'vhdl.md',
  matlab: 'matlab.md',
  embarcados: 'embarcados.md',
  python: 'python.md',
  teoria: 'teoria.md',
  triagem: 'triagem.md',
}

function detectStudyMode(task: VaultTask | undefined): string {
  if (!task) return 'triagem'
  const text = (task.title + ' ' + task.body).toLowerCase()
  if (/\.vhd\b|ghdl|vhdl/.test(text)) return 'vhdl'
  if (/\.m\b|matlab|octave/.test(text)) return 'matlab'
  if (/\barm\b|cmakelist|mbed|embarcad/.test(text)) return 'embarcados'
  if (/\.py\b|\.ipynb|pytorch|python/.test(text)) return 'python'
  return 'teoria'
}

async function resolveDirectiveText(agent: VaultAgent, firstTask: VaultTask | undefined): Promise<string> {
  const baseDir = dirname(agent.directivesPath)
  const modesDir = join(baseDir, 'modes')
  const conventionsPath = join(baseDir, 'conventions.md')

  if (!existsSync(modesDir)) return agent.directiveText

  const mode = detectStudyMode(firstTask)
  const modeFile = join(modesDir, MODE_MAP[mode] ?? 'triagem.md')

  const parts: string[] = [agent.directiveText]
  if (existsSync(modeFile)) {
    parts.push(await readFile(modeFile, 'utf8'))
  }
  if (existsSync(conventionsPath)) {
    parts.push(await readFile(conventionsPath, 'utf8'))
  }
  return parts.join('\n\n---\n\n')
}

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

export async function buildPrompt(agent: VaultAgent, project: VaultProject, maxChars: number, previousOutput?: string): Promise<string> {
  const rawTarget = typeof project.raw['target'] === 'string' ? project.raw['target'] : undefined
  const target = rawTarget ? resolveTarget(rawTarget) : undefined

  const pending = project.tasks.filter(t => t.progresso < 100)
  const directiveText = await resolveDirectiveText(agent, pending[0])

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
    directiveText,
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
