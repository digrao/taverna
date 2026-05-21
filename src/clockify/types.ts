export interface ClockifyConfig {
  apiKey: string
  workspaceId: string
  userId: string
}

export interface ClockifyProject {
  id: string
  name: string
  clientId?: string
  clientName?: string
}

export interface TimeInterval {
  start: string
  end: string
  duration: string | null
}

export interface TimeEntry {
  id: string
  projectId: string | null
  timeInterval: TimeInterval
}

export interface DeepWorkStats {
  projectId: string
  totalHours: number
  weekHours: number
  lastEntry: string
}
