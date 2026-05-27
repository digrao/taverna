import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pollMessages, waitForReply } from '../src/pm/matrix-reader.js'

const ROOM = '!room:server'
const TOKEN = 'syt_test'
const HS = 'https://matrix.example.org'

function makeSyncResponse(
  nextBatch: string,
  msgs: Array<{ eventId: string; sender: string; body: string; ts: number }> = [],
) {
  return {
    next_batch: nextBatch,
    rooms: {
      join: {
        [ROOM]: {
          timeline: {
            events: msgs.map((m) => ({
              type: 'm.room.message',
              event_id: m.eventId,
              sender: m.sender,
              origin_server_ts: m.ts,
              content: { msgtype: 'm.text', body: m.body },
            })),
          },
        },
      },
    },
  }
}

function fakeOk(data: unknown) {
  return { ok: true, json: async () => data }
}

// ── pollMessages ──────────────────────────────────────────────────────────────

describe('pollMessages', () => {
  let statePath: string
  let tmpDir: string
  const fetchMock = vi.fn()

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'matrix-poll-test-'))
    statePath = join(tmpDir, 'matrix-sync.json')
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns messages from room timeline', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeOk(
        makeSyncResponse('batch1', [
          { eventId: '$e1', sender: '@user:server', body: 'hello', ts: 1000 },
        ]),
      ),
    )
    const { messages, nextBatch } = await pollMessages(ROOM, TOKEN, HS, { statePath })
    expect(messages).toHaveLength(1)
    expect(messages[0]!.body).toBe('hello')
    expect(messages[0]!.sender).toBe('@user:server')
    expect(messages[0]!.event_id).toBe('$e1')
    expect(messages[0]!.ts).toBe(1000)
    expect(nextBatch).toBe('batch1')
  })

  it('persists next_batch between calls', async () => {
    fetchMock.mockResolvedValueOnce(fakeOk(makeSyncResponse('batch42')))
    await pollMessages(ROOM, TOKEN, HS, { statePath })

    fetchMock.mockResolvedValueOnce(fakeOk(makeSyncResponse('batch43')))
    await pollMessages(ROOM, TOKEN, HS, { statePath })

    const url = fetchMock.mock.calls[1]![0] as string
    expect(url).toContain('since=batch42')
  })

  it('does not repeat messages after next_batch is saved', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeOk(
        makeSyncResponse('batch1', [
          { eventId: '$old', sender: '@user:server', body: 'old', ts: 1000 },
        ]),
      ),
    )
    await pollMessages(ROOM, TOKEN, HS, { statePath })

    fetchMock.mockResolvedValueOnce(fakeOk(makeSyncResponse('batch2', [])))
    const { messages } = await pollMessages(ROOM, TOKEN, HS, { statePath })
    expect(messages).toHaveLength(0)
  })

  it('filters out messages from filterSender', async () => {
    fetchMock.mockResolvedValueOnce(
      fakeOk(
        makeSyncResponse('b1', [
          { eventId: '$e1', sender: '@bot:server', body: 'bot msg', ts: 1000 },
          { eventId: '$e2', sender: '@user:server', body: 'user msg', ts: 2000 },
        ]),
      ),
    )
    const { messages } = await pollMessages(ROOM, TOKEN, HS, {
      statePath,
      filterSender: '@bot:server',
    })
    expect(messages).toHaveLength(1)
    expect(messages[0]!.sender).toBe('@user:server')
  })

  it('opts.since overrides persisted next_batch', async () => {
    fetchMock.mockResolvedValueOnce(fakeOk(makeSyncResponse('persisted')))
    await pollMessages(ROOM, TOKEN, HS, { statePath })

    fetchMock.mockResolvedValueOnce(fakeOk(makeSyncResponse('next2')))
    await pollMessages(ROOM, TOKEN, HS, { statePath, since: 'override-token' })

    const url = fetchMock.mock.calls[1]![0] as string
    expect(url).toContain('since=override-token')
  })

  it('throws on non-ok HTTP response', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' })
    await expect(pollMessages(ROOM, TOKEN, HS, { statePath })).rejects.toThrow(
      'Matrix sync failed: 401',
    )
  })

  it('ignores non-m.text messages', async () => {
    const resp = makeSyncResponse('b1', [
      { eventId: '$e1', sender: '@user:server', body: 'img', ts: 1000 },
    ])
    resp.rooms.join[ROOM]!.timeline.events[0]!.content.msgtype = 'm.image'
    fetchMock.mockResolvedValueOnce(fakeOk(resp))
    const { messages } = await pollMessages(ROOM, TOKEN, HS, { statePath })
    expect(messages).toHaveLength(0)
  })

  it('saves next_batch to disk', async () => {
    fetchMock.mockResolvedValueOnce(fakeOk(makeSyncResponse('saved-batch')))
    await pollMessages(ROOM, TOKEN, HS, { statePath })
    const saved = JSON.parse(readFileSync(statePath, 'utf8')) as { next_batch: string }
    expect(saved.next_batch).toBe('saved-batch')
  })

  it('returns empty messages when room has no timeline', async () => {
    fetchMock.mockResolvedValueOnce(fakeOk({ next_batch: 'b1' }))
    const { messages } = await pollMessages(ROOM, TOKEN, HS, { statePath })
    expect(messages).toHaveLength(0)
  })
})

// ── waitForReply ──────────────────────────────────────────────────────────────

describe('waitForReply', () => {
  let statePath: string
  let tmpDir: string
  const fetchMock = vi.fn()

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'matrix-wait-test-'))
    statePath = join(tmpDir, 'matrix-sync.json')
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns first matching message', async () => {
    fetchMock.mockResolvedValue(
      fakeOk(
        makeSyncResponse('b1', [{ eventId: '$e1', sender: '@user:server', body: 'all', ts: 1000 }]),
      ),
    )
    const result = await waitForReply(ROOM, TOKEN, HS, (m) => m.body === 'all', 10_000, {
      statePath,
      pollIntervalMs: 1,
    })
    expect(result).not.toBeNull()
    expect(result!.body).toBe('all')
  })

  it('returns null when timeout expires without a match', async () => {
    fetchMock.mockResolvedValue(fakeOk(makeSyncResponse('b1', [])))
    const result = await waitForReply(ROOM, TOKEN, HS, (m) => m.body === 'never-matches', 20, {
      statePath,
      pollIntervalMs: 5,
    })
    expect(result).toBeNull()
  })

  it('finds match on second poll when first is empty', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeOk(makeSyncResponse('b1', [])))
      .mockResolvedValueOnce(
        fakeOk(
          makeSyncResponse('b2', [
            { eventId: '$e2', sender: '@user:server', body: 'skip', ts: 2000 },
          ]),
        ),
      )

    const result = await waitForReply(ROOM, TOKEN, HS, (m) => m.body === 'skip', 10_000, {
      statePath,
      pollIntervalMs: 1,
    })
    expect(result).not.toBeNull()
    expect(result!.body).toBe('skip')
  })

  it('uses updated next_batch across poll iterations', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeOk(makeSyncResponse('batch-A', [])))
      .mockResolvedValueOnce(
        fakeOk(
          makeSyncResponse('batch-B', [{ eventId: '$x', sender: '@u:s', body: 'yes', ts: 1 }]),
        ),
      )

    await waitForReply(ROOM, TOKEN, HS, (m) => m.body === 'yes', 10_000, {
      statePath,
      pollIntervalMs: 1,
    })

    const secondUrl = fetchMock.mock.calls[1]![0] as string
    expect(secondUrl).toContain('since=batch-A')
  })
})
