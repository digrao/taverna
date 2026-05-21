import { join } from 'node:path'
import { writeFile, mkdir } from 'node:fs/promises'
import { scanProjects } from './project.js'
import { discoverAgents } from './agent.js'
import type { VaultProject, VaultAgent, VaultState, VaultTask, Priority } from './types.js'
import type { TavernaConfig } from '../config.js'

export { readProject, scanProjects, detectProjectType } from './project.js'
export { readProjectTasks, progressToState } from './task.js'
export { readAgent, discoverAgents } from './agent.js'
export { readLogbook, appendLogbook } from './logbook.js'
export { updateProjectStatus, updateCompletedTaskSessionId } from './update.js'
export type { ProjectStatusUpdate } from './update.js'
export type * from './types.js'

export async function scanVault(config: TavernaConfig): Promise<VaultState> {
  const projectsDir = join(config.vaultPath, config.projectsDir)
  const directivesDir = join(config.vaultPath, config.directivesDir)

  const [projects, agents] = await Promise.all([
    scanProjects(projectsDir, config.uspFolderPrefixes),
    discoverAgents(directivesDir),
  ])

  return {
    projects,
    agents,
    scannedAt: new Date(),
    vaultPath: config.vaultPath,
  }
}

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

export function sortByPriority(projects: VaultProject[]): VaultProject[] {
  return [...projects].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
}

export function filterByAgent(projects: VaultProject[], agentId: string): VaultProject[] {
  return projects.filter(p => p.agent === agentId)
}

export function getPendingTasks(project: VaultProject): VaultTask[] {
  return project.tasks.filter(t => t.state !== 'concluida')
}

export async function writeInbox(
  content: string,
  filename: string,
  config: TavernaConfig,
): Promise<void> {
  const dir = join(config.vaultPath, config.morningOutputDir)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, filename), content, 'utf8')
}
