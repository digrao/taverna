import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import type { MigrationDraft, MigrationResult } from './types.js'

function buildProjectFrontmatter(draft: MigrationDraft): string {
  const lines: string[] = ['---']
  lines.push(`id: ${draft.id}`)
  lines.push(`tipo: '${draft.tipo}'`)
  lines.push(`priority: ${draft.priority}`)
  lines.push(`run_every: ${draft.run_every}`)

  const extra = draft.extraFrontmatter ?? {}
  for (const [k, v] of Object.entries(extra)) {
    if (v === null || v === undefined) continue
    lines.push(`${k}: ${JSON.stringify(v)}`)
  }

  lines.push('---')
  return lines.join('\n')
}

function buildTaskFile(task: {
  title: string
  prioridade: string
  progresso: number
  body: string
}): string {
  const lines: string[] = [
    '---',
    `prioridade: ${task.prioridade}`,
    `progresso: ${task.progresso}`,
    '---',
    `# ${task.title}`,
    '',
    task.body,
  ]
  return lines.join('\n')
}

export async function promote(
  draft: MigrationDraft,
  projectsDir: string,
  opts: { dryRun?: boolean; noTasks?: boolean } = {},
): Promise<MigrationResult> {
  const projectFolder = join(projectsDir, draft.id)
  const projectFile = join(projectFolder, `${draft.id}.md`)
  const tasksDir = join(projectFolder, 'tasks')

  const frontmatter = buildProjectFrontmatter(draft)
  const projectContent = `${frontmatter}\n${draft.body}\n`

  const tasksToCreate = opts.noTasks ? [] : draft.tasks
  const taskFiles = tasksToCreate.map((t) => ({
    path: join(tasksDir, `${t.id}.md`),
    content: buildTaskFile(t),
  }))

  if (opts.dryRun) {
    return {
      projectPath: projectFile,
      tasksCreated: taskFiles.map((f) => f.path),
      draft,
    }
  }

  if (existsSync(projectFolder)) {
    throw new Error(`Project folder already exists: ${projectFolder}`)
  }

  await mkdir(projectFolder, { recursive: true })
  await writeFile(projectFile, projectContent, 'utf8')
  await writeFile(
    join(projectFolder, 'logbook.md'),
    `# Logbook — ${draft.id}\n\n<!-- append entries below; newest at bottom -->\n`,
    'utf8',
  )

  const tasksCreated: string[] = []
  if (taskFiles.length > 0) {
    await mkdir(tasksDir, { recursive: true })
    for (const { path, content } of taskFiles) {
      await writeFile(path, content, 'utf8')
      tasksCreated.push(path)
    }
  }

  return { projectPath: projectFile, tasksCreated }
}
