import { emitEvent } from './event-bus.js'

export type LogStatus = 'success' | 'failed'

export interface AgentRunPayload {
  event: 'agent_run'
  project: string
  agent: string
  status: LogStatus
  duration_s: number
  tokens_in?: number
  tokens_out?: number
  cache_read?: number
  cache_fill?: number
  cost_usd?: number
  cache_hit_pct?: number
  [key: string]: unknown
}

export function log(payload: AgentRunPayload): void {
  emitEvent(payload)
}
