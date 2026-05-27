import { NeoMatrixClient } from 'neo-matrix'

export interface MatrixConfig {
  homeserver: string
  roomId: string
  accessToken: string
  displayName?: string
}

export function matrixConfigFromEnv(): MatrixConfig | undefined {
  const homeserver = process.env['MATRIX_HOMESERVER']
  const roomId = process.env['MATRIX_ROOM_ID']
  const accessToken = process.env['MATRIX_ACCESS_TOKEN']
  if (!homeserver || !roomId || !accessToken) return undefined
  return { homeserver, roomId, accessToken }
}

export async function sendMatrixMessage(config: MatrixConfig, text: string): Promise<void> {
  const client = new NeoMatrixClient({
    homeserver: config.homeserver,
    accessToken: config.accessToken,
    roomId: config.roomId,
    ...(config.displayName !== undefined ? { displayName: config.displayName } : {}),
  })
  await client.send(text)
}

export function formatAgentStartMessage(
  project: string,
  agent: string,
  tmuxSession: string,
  sessionId: string,
): string {
  return [
    `[taverna] ▶ ${agent} iniciou ${project}`,
    `tmux: tmux attach -t ${tmuxSession}`,
    `session: ${sessionId}`,
  ].join('\n')
}

export function formatAgentRunMessage(
  project: string,
  agent: string,
  resultado?: string,
  sessionId?: string,
): string {
  const lines = [`[taverna] ✓ ${agent} concluiu ${project}`, resultado ?? '(sem RESULTADO)']
  if (sessionId) lines.push(`session: ${sessionId}`)
  return lines.join('\n')
}

export function formatActionRequiredMessage(
  project: string,
  agent: string,
  action: string,
  sessionId?: string,
): string {
  const lines = [`[taverna] ⚠ ${agent} aguarda input em ${project}`, action]
  if (sessionId) lines.push(`Retomar: claude --resume ${sessionId}`)
  return lines.join('\n')
}
