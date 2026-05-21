export type LogEvent = 'agent_run'
export type LogStatus = 'success' | 'failed'

export interface AgentRunPayload {
  event: 'agent_run'
  project: string
  agent: string
  status: LogStatus
  duration_s: number
}

type LogPayload = AgentRunPayload

export function log(payload: LogPayload): void {
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), ...payload }) + '\n')
}
