import type { ClockifyConfig, ClockifyProject, TimeEntry } from './types.js'

const BASE = 'https://api.clockify.me/api/v1'

async function apiGet<T>(config: ClockifyConfig, path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString(), {
    headers: { 'X-Api-Key': config.apiKey },
  })
  if (!res.ok) {
    throw new Error(`Clockify API ${res.status}: ${res.statusText} — ${path}`)
  }
  return res.json() as T
}

export async function fetchProjects(config: ClockifyConfig): Promise<ClockifyProject[]> {
  return apiGet<ClockifyProject[]>(config, `/workspaces/${config.workspaceId}/projects`, {
    'page-size': '500',
  })
}

export async function fetchEntries(
  config: ClockifyConfig,
  from: Date,
  to: Date,
): Promise<TimeEntry[]> {
  const entries: TimeEntry[] = []
  let page = 1
  const pageSize = 50

  while (true) {
    const batch = await apiGet<TimeEntry[]>(
      config,
      `/workspaces/${config.workspaceId}/user/${config.userId}/time-entries`,
      {
        start: from.toISOString(),
        end: to.toISOString(),
        page: String(page),
        'page-size': String(pageSize),
      },
    )
    entries.push(...batch)
    if (batch.length < pageSize) break
    page++
  }

  return entries
}
