import { writeFile, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

export type UspTaskType = 'USP-aula' | 'USP-entrega'
export type TaskType = UspTaskType | 'generic'
export type TaskPrioridade = 'alta' | 'média' | 'baixa'

export interface UspTaskInput {
  type: UspTaskType
  topic: string
  prioridade: TaskPrioridade
  assetFolder?: string
  deadline?: string
  workspace?: string
  dependsOn?: string[]
}

export interface GenericTaskInput {
  type: 'generic'
  topic: string
  prioridade: TaskPrioridade
  body?: string
  depende?: string[]
  deadline?: string
}

export type TaskScaffoldInput = UspTaskInput | GenericTaskInput

export interface TaskScaffoldResult {
  id: string
  filePath: string
  created: boolean
  reason?: 'already_exists'
}

// NFD decomposes accented chars; strip all combining marks, then lowercase and slugify
export function deriveTaskId(topic: string): string {
  const id = topic
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, 40)
    .replace(/[_-]$/, '')

  return id || 'task'
}

async function nextTaskNumber(tasksDir: string): Promise<number> {
  const dirs = [tasksDir, join(tasksDir, 'archive')]
  let max = 0
  for (const dir of dirs) {
    let entries: string[]
    try {
      entries = (await readdir(dir)).filter((n) => n.endsWith('.md'))
    } catch {
      continue
    }
    for (const name of entries) {
      const m = name.match(/^(\d+)[-_]/)
      if (m?.[1]) max = Math.max(max, parseInt(m[1], 10))
    }
  }
  return max + 1
}

function buildUspContent(input: UspTaskInput, projectId: string): string {
  const lines: string[] = [
    '---',
    `type: ${input.type}`,
    `parent: ${projectId}`,
    `topic: "${input.topic.replace(/"/g, '\\"')}"`,
    'progresso: 0',
    `prioridade: ${input.prioridade}`,
  ]

  if (input.deadline) lines.push(`deadline: ${input.deadline}`)
  if (input.assetFolder) lines.push(`asset_folder: ${input.assetFolder}`)
  if (input.workspace) lines.push(`workspace: ${input.workspace}`)
  if (input.dependsOn && input.dependsOn.length > 0) {
    lines.push('depends_on:')
    for (const dep of input.dependsOn) lines.push(`  - ${dep}`)
  }

  lines.push('---', '', `# ${input.topic}`, '')
  return lines.join('\n')
}

function buildGenericContent(input: GenericTaskInput): string {
  const lines: string[] = ['---', 'progresso: 0', `prioridade: ${input.prioridade}`]

  if (input.deadline) lines.push(`deadline: ${input.deadline}`)
  if (input.depende && input.depende.length > 0) {
    lines.push('depende:')
    for (const dep of input.depende) lines.push(`  - '[[${dep}]]'`)
  }

  lines.push('---', '', `# ${input.topic}`, '')

  if (input.body) {
    lines.push(input.body, '')
  }

  lines.push('## Critérios de conclusão', '', '- [ ] ', '')
  return lines.join('\n')
}

export async function addTask(
  projectFolderPath: string,
  projectId: string,
  input: TaskScaffoldInput,
): Promise<TaskScaffoldResult> {
  const tasksDir = join(projectFolderPath, 'tasks')

  let id: string
  let filePath: string

  if (input.type === 'generic') {
    const n = await nextTaskNumber(tasksDir)
    const slug = deriveTaskId(input.topic)
    id = `${n}-${slug}`
    filePath = join(tasksDir, `${id}.md`)
  } else {
    id = deriveTaskId(input.topic)
    filePath = join(tasksDir, `${id}.md`)
  }

  if (existsSync(filePath)) {
    return { id, filePath, created: false, reason: 'already_exists' }
  }

  await mkdir(tasksDir, { recursive: true })
  const content =
    input.type === 'generic' ? buildGenericContent(input) : buildUspContent(input, projectId)
  await writeFile(filePath, content, 'utf8')

  return { id, filePath, created: true }
}
