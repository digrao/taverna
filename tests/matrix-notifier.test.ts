import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MatrixNotifier, matrixNotifierFromEnv } from '../src/notifications/matrix.js'

const baseConfig = {
  homeserver: 'https://matrix.example.com',
  accessToken: 'tok_test',
  rooms: [
    { id: '!general:example.com', alias: 'general' },
    { id: '!proj-a:example.com', alias: 'proj-a', projectFilter: ['project-alpha'] },
  ],
}

function mockFetch() {
  return vi.spyOn(global, 'fetch').mockResolvedValue(new Response())
}

describe('MatrixNotifier', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('sends to all rooms when no project is specified', async () => {
    const spy = mockFetch()
    const notifier = new MatrixNotifier(baseConfig)
    await notifier.send({ text: 'hello' })
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('sends only to rooms matching the project', async () => {
    const spy = mockFetch()
    const notifier = new MatrixNotifier(baseConfig)
    await notifier.send({ text: 'task done', project: 'project-alpha' })
    expect(spy).toHaveBeenCalledOnce()
    const url = spy.mock.calls[0][0] as string
    expect(decodeURIComponent(url)).toContain('!proj-a:example.com')
  })

  it('sends nothing when project has no matching room', async () => {
    const spy = mockFetch()
    const notifier = new MatrixNotifier(baseConfig)
    await notifier.send({ text: 'x', project: 'unknown-project' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('formats [CRITICAL] prefix for critical urgency', async () => {
    const spy = mockFetch()
    const notifier = new MatrixNotifier(baseConfig)
    await notifier.send({ text: 'disk full', urgency: 'critical' })
    const body = JSON.parse(spy.mock.calls[0][1]!.body as string) as { body: string }
    expect(body.body).toContain('[CRITICAL]')
  })

  it('formats [WARN] prefix for warning urgency', async () => {
    const spy = mockFetch()
    const notifier = new MatrixNotifier(baseConfig)
    await notifier.send({ text: 'slow', urgency: 'warning' })
    const body = JSON.parse(spy.mock.calls[0][1]!.body as string) as { body: string }
    expect(body.body).toContain('[WARN]')
  })

  it('includes project and agent in formatted text', async () => {
    const spy = mockFetch()
    const notifier = new MatrixNotifier(baseConfig)
    await notifier.send({ text: 'done', agent: '@dev-agent' })
    const body = JSON.parse(spy.mock.calls[0][1]!.body as string) as { body: string }
    expect(body.body).toContain('(@dev-agent)')
  })
})

describe('matrixNotifierFromEnv', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns undefined when MATRIX_HOMESERVER is missing', () => {
    vi.stubEnv('MATRIX_HOMESERVER', '')
    vi.stubEnv('MATRIX_ACCESS_TOKEN', 'tok')
    expect(matrixNotifierFromEnv()).toBeUndefined()
  })

  it('returns undefined when MATRIX_ACCESS_TOKEN is missing', () => {
    vi.stubEnv('MATRIX_HOMESERVER', 'https://matrix.example.com')
    vi.stubEnv('MATRIX_ACCESS_TOKEN', '')
    expect(matrixNotifierFromEnv()).toBeUndefined()
  })

  it('returns a MatrixNotifier when both vars are set', () => {
    vi.stubEnv('MATRIX_HOMESERVER', 'https://matrix.example.com')
    vi.stubEnv('MATRIX_ACCESS_TOKEN', 'tok')
    vi.stubEnv('MATRIX_ROOM_IDS', '')
    expect(matrixNotifierFromEnv()).toBeInstanceOf(MatrixNotifier)
  })

  it('registers rooms from MATRIX_ROOM_IDS (comma-separated)', () => {
    vi.stubEnv('MATRIX_HOMESERVER', 'https://matrix.example.com')
    vi.stubEnv('MATRIX_ACCESS_TOKEN', 'tok')
    vi.stubEnv('MATRIX_ROOM_IDS', '!room1:example.com,!room2:example.com')
    vi.stubEnv('MATRIX_ROOM_ID', '')
    expect(matrixNotifierFromEnv()).toBeInstanceOf(MatrixNotifier)
  })
})
