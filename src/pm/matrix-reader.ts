import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'

export interface MatrixMessage {
  event_id: string
  sender: string
  body: string
  ts: number
}

export interface PollOptions {
  since?: string
  timeoutMs?: number
  filterSender?: string
  statePath?: string
}

const DEFAULT_STATE_PATH = join(homedir(), '.config', 'taverna', 'matrix-sync.json')

function loadNextBatch(statePath: string): string | undefined {
  if (!existsSync(statePath)) return undefined
  try {
    const data = JSON.parse(readFileSync(statePath, 'utf8')) as { next_batch?: unknown }
    return typeof data.next_batch === 'string' ? data.next_batch : undefined
  } catch {
    return undefined
  }
}

function saveNextBatch(statePath: string, nextBatch: string): void {
  mkdirSync(dirname(statePath), { recursive: true })
  writeFileSync(statePath, JSON.stringify({ next_batch: nextBatch }))
}

interface MatrixEvent {
  type: string
  event_id: string
  sender: string
  origin_server_ts: number
  content: {
    msgtype?: string
    body?: string
  }
}

interface MatrixSyncResponse {
  next_batch: string
  rooms?: {
    join?: Record<
      string,
      {
        timeline?: {
          events?: MatrixEvent[]
        }
      }
    >
  }
}

export async function pollMessages(
  roomId: string,
  accessToken: string,
  homeserver: string,
  opts?: PollOptions,
): Promise<{ messages: MatrixMessage[]; nextBatch: string }> {
  const statePath = opts?.statePath ?? DEFAULT_STATE_PATH
  const since = opts?.since ?? loadNextBatch(statePath)
  const timeoutMs = opts?.timeoutMs ?? 0

  const params = new URLSearchParams({ timeout: String(timeoutMs) })
  if (since !== undefined) params.set('since', since)

  const url = `${homeserver}/_matrix/client/v3/sync?${params}`
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    throw new Error(`Matrix sync failed: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as MatrixSyncResponse
  const nextBatch = data.next_batch
  saveNextBatch(statePath, nextBatch)

  const messages: MatrixMessage[] = []
  const roomEvents = data.rooms?.join?.[roomId]?.timeline?.events ?? []

  for (const event of roomEvents) {
    if (event.type !== 'm.room.message') continue
    if (event.content.msgtype !== 'm.text') continue
    if (opts?.filterSender !== undefined && event.sender === opts.filterSender) continue
    messages.push({
      event_id: event.event_id,
      sender: event.sender,
      body: event.content.body ?? '',
      ts: event.origin_server_ts,
    })
  }

  return { messages, nextBatch }
}

export async function waitForReply(
  roomId: string,
  accessToken: string,
  homeserver: string,
  predicate: (msg: MatrixMessage) => boolean,
  timeoutMs: number,
  opts?: { statePath?: string; filterSender?: string; pollIntervalMs?: number },
): Promise<MatrixMessage | null> {
  const deadline = Date.now() + timeoutMs
  const pollIntervalMs = opts?.pollIntervalMs ?? 5_000

  while (Date.now() < deadline) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    const syncTimeout = Math.min(pollIntervalMs, remaining)

    const pollOpts: PollOptions = { timeoutMs: syncTimeout }
    if (opts?.statePath !== undefined) pollOpts.statePath = opts.statePath
    if (opts?.filterSender !== undefined) pollOpts.filterSender = opts.filterSender

    const { messages } = await pollMessages(roomId, accessToken, homeserver, pollOpts)
    for (const msg of messages) {
      if (predicate(msg)) return msg
    }
  }

  return null
}
