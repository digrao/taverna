import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

export type UspTaskType = 'USP-aula' | 'USP-entrega'
export type TaskPrioridade = 'alta' | 'média' | 'baixa'

export interface TaskScaffoldInput {
  type: UspTaskType
  topic: string
  prioridade: TaskPrioridade
  assetFolder?: string
  deadline?: string
  workspace?: string
  dependsOn?: string[]
}

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

function buildContent(input: TaskScaffoldInput, projectId: string): string {
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

export async function addTask(
  projectFolderPath: string,
  projectId: string,
  input: TaskScaffoldInput,
): Promise<TaskScaffoldResult> {
  const id = deriveTaskId(input.topic)
  const tasksDir = join(projectFolderPath, 'tasks')
  const filePath = join(tasksDir, `${id}.md`)

  if (existsSync(filePath)) {
    return { id, filePath, created: false, reason: 'already_exists' }
  }

  await mkdir(tasksDir, { recursive: true })
  await writeFile(filePath, buildContent(input, projectId), 'utf8')

  return { id, filePath, created: true }
}
