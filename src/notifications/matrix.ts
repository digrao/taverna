import { NeoMatrixClient } from '@jvcm-infra/neo-matrix'
import type { Notifier, NotificationMessage } from './types.js'

export class MatrixNotifier implements Notifier {
  constructor(private readonly client: NeoMatrixClient) {}

  async send(msg: NotificationMessage): Promise<void> {
    const rooms = msg.project ? this.client.rooms.byProject(msg.project) : this.client.rooms.all()

    if (rooms.length === 0) return

    const text = format(msg)
    await Promise.allSettled(rooms.map((r) => this.client.send(r.id, text)))
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

/** Build a MatrixNotifier from MATRIX_* env vars. Returns undefined if not configured. */
export function matrixNotifierFromEnv(): MatrixNotifier | undefined {
  const homeserver = process.env['MATRIX_HOMESERVER']
  const accessToken = process.env['MATRIX_ACCESS_TOKEN']
  if (!homeserver || !accessToken) return undefined

  const client = new NeoMatrixClient({ homeserver, accessToken, rooms: [] })

  const roomIds = (process.env['MATRIX_ROOM_IDS'] ?? process.env['MATRIX_ROOM_ID'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  for (const id of roomIds) client.rooms.add({ id })

  return new MatrixNotifier(client)
}
