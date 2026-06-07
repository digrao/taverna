import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

export interface ProjectScaffoldResult {
  id: string
  projectPath: string
  created: boolean
  reason?: 'already_exists'
}

export async function scaffoldProject(
  projectsDir: string,
  id: string,
): Promise<ProjectScaffoldResult> {
  const projectPath = join(projectsDir, id)

  if (existsSync(projectPath)) {
    return { id, projectPath, created: false, reason: 'already_exists' }
  }

  await mkdir(join(projectPath, 'tasks', 'archive'), { recursive: true })
  await writeFile(join(projectPath, 'README.md'), `---\nid: ${id}\n---\n\n# ${id}\n`, 'utf8')

  return { id, projectPath, created: true }
}
