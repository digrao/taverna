import type { TimeEntry, ClockifyProject, DeepWorkStats } from './types.js'

export function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/)
  if (!m || !m[0] || m[0] === 'PT') return 0
  const h = Number(m[1] ?? 0)
  const min = Number(m[2] ?? 0)
  const s = Number(m[3] ?? 0)
  return h + min / 60 + s / 3600
}

export function matchEntries(
  entries: TimeEntry[],
  clockifyProjects: ClockifyProject[],
  weekStart: Date,
): DeepWorkStats[] {
  const projectMap = new Map<string, ClockifyProject>()
  for (const p of clockifyProjects) {
    projectMap.set(p.id, p)
  }

  const grouped = new Map<string, TimeEntry[]>()
  for (const entry of entries) {
    if (!entry.projectId || !entry.timeInterval.duration) continue
    const list = grouped.get(entry.projectId) ?? []
    list.push(entry)
    grouped.set(entry.projectId, list)
  }

  const stats: DeepWorkStats[] = []
  for (const [clockifyProjectId, projectEntries] of grouped) {
    const cp = projectMap.get(clockifyProjectId)
    if (!cp) continue

    let totalHours = 0
    let weekHours = 0
    let lastEntry = ''

    for (const entry of projectEntries) {
      const hours = parseDuration(entry.timeInterval.duration!)
      totalHours += hours

      const entryStart = new Date(entry.timeInterval.start)
      if (entryStart >= weekStart) {
        weekHours += hours
      }

      const entryEnd = entry.timeInterval.end
      if (!lastEntry || entryEnd > lastEntry) {
        lastEntry = entryEnd
      }
    }

    stats.push({
      projectId: cp.name,
      totalHours: Math.round(totalHours * 100) / 100,
      weekHours: Math.round(weekHours * 100) / 100,
      lastEntry,
    })
  }

  return stats
}
