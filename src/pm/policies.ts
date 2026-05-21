import type { TavernaConfig } from '../config.js'
import type { TypePolicy } from './scheduler.js'

export function defaultTypePolicies(config: TavernaConfig): TypePolicy[] {
  return [
    {
      tipo: 'USP',
      steps: [
        { agent: config.agentDefaults['USP'] ?? '@study-assistant', at: '09:00' },
        { agent: config.agentDefaults['USP'] ?? '@study-assistant', at: 'EOD' },
        { agent: config.agentDefaults['USP'] ?? '@study-assistant' },
      ],
    },
    {
      tipo: 'BB',
      steps: [{ agent: config.agentDefaults['BB'] ?? '@planner' }],
    },
    {
      tipo: '*',
      steps: [{ agent: config.agentDefaults['*'] ?? '@dev-agent' }],
    },
  ]
}
