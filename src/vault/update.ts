import { readFile, writeFile } from 'node:fs/promises'
import matter from 'gray-matter'

export interface ProjectStatusUpdate {
  lastRun?: string
  lastStatus: 'success' | 'failed'
  runsTotal: number
}

export async function updateProjectStatus(
  filePath: string,
  update: ProjectStatusUpdate,
): Promise<void> {
  const raw = await readFile(filePath, 'utf8')
  const parsed = matter(raw)
  if (update.lastRun !== undefined) parsed.data['_last_run'] = update.lastRun
  parsed.data['_last_status'] = update.lastStatus
  parsed.data['_runs_total'] = update.runsTotal
  await writeFile(filePath, matter.stringify(parsed.content, parsed.data), 'utf8')
}
