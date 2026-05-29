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

/**
 * Send a plain-text message to a Matrix room via the client-server API.
 * Uses the standard PUT /rooms/{roomId}/send endpoint — no external library needed.
 *
 * Future: a taverna-matrix plugin can register a custom Notifier here for richer
 * message types (HTML, reactions, edits).
 */
export async function sendMatrixMessage(config: MatrixConfig, text: string): Promise<void> {
  const txnId = Date.now().toString(36)
  const roomEncoded = encodeURIComponent(config.roomId)
  const url = `${config.homeserver}/_matrix/client/v3/rooms/${roomEncoded}/send/m.room.message/${txnId}`

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ msgtype: 'm.text', body: text }),
  })

  if (!res.ok) {
    throw new Error(`Matrix send failed: ${res.status} ${res.statusText}`)
  }
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
