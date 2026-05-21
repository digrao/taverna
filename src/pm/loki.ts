export type LogEvent = 'agent_start' | 'agent_run'
export type LogStatus = 'success' | 'failed'

export interface AgentStartPayload {
  event: 'agent_start'
  project: string
  agent: string
}

export interface AgentRunPayload {
  event: 'agent_run'
  project: string
  agent: string
  status: LogStatus
  duration_s: number
}

type LogPayload = AgentStartPayload | AgentRunPayload

export function log(payload: LogPayload): void {
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), ...payload }) + '\n')
}
