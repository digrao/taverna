export interface MatrixConfig {
  homeserver: string
  roomId: string
  accessToken: string
}

export function matrixConfigFromEnv(): MatrixConfig | undefined {
  const homeserver = process.env['MATRIX_HOMESERVER']
  const roomId = process.env['MATRIX_ROOM_ID']
  const accessToken = process.env['MATRIX_ACCESS_TOKEN']
  if (!homeserver || !roomId || !accessToken) return undefined
  return { homeserver, roomId, accessToken }
}

export async function sendMatrixMessage(config: MatrixConfig, text: string): Promise<void> {
  const txnId = Date.now().toString(36) + Math.random().toString(36).slice(2)
  const url = `${config.homeserver}/_matrix/client/v3/rooms/${encodeURIComponent(config.roomId)}/send/m.room.message/${txnId}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ msgtype: 'm.text', body: text }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`Matrix PUT ${res.status}: ${err}`)
  }
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
  const lines = [
    `[taverna] ⚠ ${agent} aguarda input em ${project}`,
    action,
  ]
  if (sessionId) lines.push(`Retomar: claude --resume ${sessionId}`)
  return lines.join('\n')
}
