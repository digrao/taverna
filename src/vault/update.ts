import { readFile, writeFile } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'
import matter from 'gray-matter'

export interface ProjectStatusUpdate {
  lastRun?: string
  lastStatus: 'success' | 'failed'
  runsTotal: number
}

// Writes _session_id to pending tasks at run start so the user can resume via
// `claude --resume <id>` if intervention is needed before the task completes.
export async function markTasksInProgress(
  pendingTaskPaths: string[],
  sessionId: string,
): Promise<void> {
  for (const filePath of pendingTaskPaths) {
    try {
      const raw = await readFile(filePath, 'utf8')
      const parsed = matter(raw)
      parsed.data['_session_id'] = sessionId
      parsed.data['_session_started'] = new Date().toISOString()
      await writeFile(filePath, matter.stringify(parsed.content, parsed.data), 'utf8')
    } catch { /* non-fatal */ }
  }
}

export async function updateCompletedTaskSessionId(
  pendingTaskPaths: string[],
  sessionId: string,
): Promise<void> {
  for (const filePath of pendingTaskPaths) {
    const archivePath = join(dirname(filePath), 'archive', basename(filePath))
    let updated = false
    for (const path of [filePath, archivePath]) {
      if (updated) break
      try {
        const raw = await readFile(path, 'utf8')
        const parsed = matter(raw)
        const progresso = parsed.data['progresso'] ?? parsed.data['progress']
        const done = typeof progresso === 'number'
          ? progresso >= 100
          : typeof progresso === 'string' && parseInt(progresso, 10) >= 100
        if (done) {
          parsed.data['_session_id'] = sessionId
          await writeFile(path, matter.stringify(parsed.content, parsed.data), 'utf8')
          updated = true
        }
      } catch { /* file missing or unreadable */ }
    }
  }
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
