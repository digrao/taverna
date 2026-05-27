import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

export interface ProjectScaffoldInput {
  id: string
  name: string
  tipo?: 'USP' | '*'
  agent?: string
  priority?: string
  hostname?: string
  workspaceDir?: string
  edisciplinas?: string
  horarios?: Array<{ dia: string; hora: string; local?: string | undefined }>
  contatos?: string[]
}

export interface ProjectScaffoldResult {
  id: string
  folderPath: string
  created: boolean
  reason?: 'already_exists'
}

function buildProjectFrontmatter(input: ProjectScaffoldInput): string {
  const tipo = input.tipo ?? 'USP'
  const agent = input.agent ?? (tipo === 'USP' ? '@study-assistant' : '@dev-agent')
  const priority = input.priority ?? 'medium'

  const lines: string[] = [
    '---',
    `id: ${input.id}`,
    `tipo: ${tipo}`,
    `priority: ${priority}`,
    `agent: '${agent}'`,
    'run_every: daily',
  ]

  if (input.hostname) lines.push(`hostname: ${input.hostname}`)
  if (input.workspaceDir) lines.push(`workspace_dir: ${input.workspaceDir}`)

  if (input.edisciplinas) lines.push(`edisciplinas: '${input.edisciplinas}'`)

  if (input.contatos && input.contatos.length > 0) {
    lines.push('contatos:')
    for (const c of input.contatos) lines.push(`  - '${c}'`)
  }

  if (input.horarios && input.horarios.length > 0) {
    lines.push('horarios:')
    for (const h of input.horarios) {
      lines.push(`  - dia: ${h.dia}`)
      lines.push(`    hora: ${h.hora}`)
      if (h.local) lines.push(`    local: '${h.local}'`)
    }
  }

  lines.push('---')
  return lines.join('\n')
}

function buildProjectMd(input: ProjectScaffoldInput): string {
  const fm = buildProjectFrontmatter(input)
  return [
    fm,
    '',
    `# ${input.name}`,
    '',
    '## Estado Atual',
    '> Ver [[Logbook]] — última linha é o estado atual e próximo passo.',
    '',
    '## Deadlines',
    '',
    '## Referências',
    '- [[Logbook]] — fonte de verdade do progresso',
    '- [[Progresso]] — tasks ativas',
    '- [[Material]] — PDFs e referências',
    '',
  ].join('\n')
}

function buildProgressoMd(input: ProjectScaffoldInput): string {
  return [
    '## Progresso',
    '',
    '```dataview',
    'TABLE progresso, prioridade, deadline',
    `FROM "10_Projects/${input.id}/tasks"`,
    'WHERE progresso < 100',
    'SORT prioridade DESC',
    '```',
    '',
  ].join('\n')
}

function buildMaterialMd(input: ProjectScaffoldInput): string {
  return [
    '## Material',
    '',
    '```dataviewjs',
    `const folderPath = "10_Projects/${input.id}/assets";`,
    'const files = app.vault.getFiles().filter(f => f.path.startsWith(folderPath));',
    'const groups = {};',
    'files.forEach(f => {',
    '    const rel = f.path.replace(folderPath + "/", "");',
    '    const parts = rel.split("/");',
    '    const folder = parts.length > 1 ? parts[0] : "Raiz";',
    '    if (!groups[folder]) groups[folder] = [];',
    '    groups[folder].push(f);',
    '});',
    'dv.table(',
    '    ["Diretório", "Conteúdo"],',
    '    Object.entries(groups).map(([folder, folderFiles]) => [',
    '        folder,',
    '        folderFiles.map((f, i) => `${i + 1}. ${dv.fileLink(f.path)}`).join("<br>")',
    '    ])',
    ');',
    '```',
    '',
  ].join('\n')
}

const LOGBOOK_MD = [
  '## Log de Evolução',
  '',
  '| Data | O que aprendi/fiz | Bloqueio? | Próximo Passo |',
  '| :--- | :--- | :--- | :--- |',
  '',
].join('\n')

const TASKS_README = [
  '# Tasks',
  '',
  'Tasks ativas ficam aqui. Concluídas (progresso: 100) vão para `archive/`.',
  '',
].join('\n')

export async function scaffoldProject(
  projectsDir: string,
  input: ProjectScaffoldInput,
): Promise<ProjectScaffoldResult> {
  const folderPath = join(projectsDir, input.id)

  if (existsSync(folderPath)) {
    return { id: input.id, folderPath, created: false, reason: 'already_exists' }
  }

  await mkdir(join(folderPath, 'tasks', 'archive'), { recursive: true })
  await mkdir(join(folderPath, 'assets'), { recursive: true })
  await mkdir(join(folderPath, 'entregas'), { recursive: true })

  await writeFile(join(folderPath, `${input.id}.md`), buildProjectMd(input), 'utf8')
  await writeFile(join(folderPath, 'Logbook.md'), LOGBOOK_MD, 'utf8')
  await writeFile(join(folderPath, 'Progresso.md'), buildProgressoMd(input), 'utf8')
  await writeFile(join(folderPath, 'Material.md'), buildMaterialMd(input), 'utf8')
  await writeFile(join(folderPath, 'tasks', 'README.md'), TASKS_README, 'utf8')

  return { id: input.id, folderPath, created: true }
}
