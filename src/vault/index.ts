import { join } from 'node:path'
import { scanProjects } from './project.js'
import type { VaultProject } from './types.js'
import type { TavernaConfig } from '../config.js'

export { readProject, scanProjects } from './project.js'
export { readProjectTasks } from './task.js'
export { readInbox } from './inbox.js'
export { findBacklinks } from './backlinks.js'
export type { Backlink } from './backlinks.js'
export { scaffoldProject } from './project-scaffold.js'
export type { ProjectScaffoldResult } from './project-scaffold.js'
export { writeTaskFile, slugify } from './task-scaffold.js'
export type { TaskFileInput, TaskFileResult } from './task-scaffold.js'
export type * from './types.js'

export async function scanVault(config: TavernaConfig): Promise<VaultProject[]> {
  return scanProjects(join(config.vaultPath, config.projectsDir))
}
