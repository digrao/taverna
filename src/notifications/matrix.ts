import type { Notifier, NotificationMessage } from './types.js'

export interface MatrixRoom {
  id: string
  alias?: string
  projectFilter?: string[]
}

export interface MatrixConfig {
  homeserver: string
  accessToken: string
  rooms: MatrixRoom[]
}

export class MatrixNotifier implements Notifier {
  constructor(private readonly config: MatrixConfig) {}

  async send(msg: NotificationMessage): Promise<void> {
    const rooms = msg.project
      ? this.config.rooms.filter((r) => r.projectFilter?.includes(msg.project!))
      : this.config.rooms

    if (rooms.length === 0) return

    const text = format(msg)
    await Promise.allSettled(rooms.map((r) => this.sendToRoom(r.id, text)))
  }

  private async sendToRoom(roomId: string, text: string): Promise<void> {
    const txnId = Date.now()
    const url = `${this.config.homeserver}/_matrix/client/r0/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`
    await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ msgtype: 'm.text', body: text }),
    })
  }
}

function format(msg: NotificationMessage): string {
  const prefix =
    msg.urgency === 'critical' ? '[CRITICAL]' : msg.urgency === 'warning' ? '[WARN]' : '[INFO]'
  const parts = [prefix, msg.text]
  if (msg.project) parts.push(`[${msg.project}]`)
  if (msg.agent) parts.push(`(${msg.agent})`)
  return parts.join(' ')
}

export function matrixNotifierFromEnv(): MatrixNotifier | undefined {
  const homeserver = process.env['MATRIX_HOMESERVER']
  const accessToken = process.env['MATRIX_ACCESS_TOKEN']
  if (!homeserver || !accessToken) return undefined

  const roomIds = (process.env['MATRIX_ROOM_IDS'] ?? process.env['MATRIX_ROOM_ID'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  return new MatrixNotifier({
    homeserver,
    accessToken,
    rooms: roomIds.map((id) => ({ id })),
  })
}
