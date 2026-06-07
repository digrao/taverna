import { describe, it, expect, vi } from 'vitest'
import { NotificationBus } from '../../src/notifications/bus.js'
import type { TavernaEvent } from '../../src/notifications/types.js'

function event(type: string): TavernaEvent {
  return { type, payload: { type }, timestamp: '2026-06-07T00:00:00.000Z' }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('NotificationBus', () => {
  it('delivers an event to a subscriber whose pattern matches its type', async () => {
    const bus = new NotificationBus()
    const handler = vi.fn()
    bus.subscribe('core.task.moved', handler)

    bus.publish(event('core.task.moved'))
    await flush()

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(event('core.task.moved'))
  })

  it('matches glob patterns with "*" against any run of characters', async () => {
    const bus = new NotificationBus()
    const coreHandler = vi.fn()
    const allHandler = vi.fn()
    const taskHandler = vi.fn()
    bus.subscribe('core.*', coreHandler)
    bus.subscribe('*', allHandler)
    bus.subscribe('core.task.*', taskHandler)

    bus.publish(event('core.task.moved'))
    bus.publish(event('plugin.thing.happened'))
    await flush()

    expect(coreHandler).toHaveBeenCalledTimes(1)
    expect(taskHandler).toHaveBeenCalledTimes(1)
    expect(allHandler).toHaveBeenCalledTimes(2)
  })

  it('does not deliver to subscribers whose pattern does not match', async () => {
    const bus = new NotificationBus()
    const handler = vi.fn()
    bus.subscribe('core.project.*', handler)

    bus.publish(event('core.task.moved'))
    await flush()

    expect(handler).not.toHaveBeenCalled()
  })

  it('stops delivering to a subscriber once it unsubscribes', async () => {
    const bus = new NotificationBus()
    const handler = vi.fn()
    const unsubscribe = bus.subscribe('*', handler)

    bus.publish(event('a'))
    await flush()
    unsubscribe()
    bus.publish(event('b'))
    await flush()

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('delivers to other subscribers even when one handler throws (best-effort delivery)', async () => {
    const bus = new NotificationBus()
    const failing = vi.fn().mockRejectedValue(new Error('boom'))
    const succeeding = vi.fn()
    bus.subscribe('*', failing)
    bus.subscribe('*', succeeding)

    expect(() => bus.publish(event('a'))).not.toThrow()
    await flush()

    expect(failing).toHaveBeenCalledTimes(1)
    expect(succeeding).toHaveBeenCalledTimes(1)
  })

  it('escapes regex-special characters in the literal portions of a pattern', async () => {
    const bus = new NotificationBus()
    const handler = vi.fn()
    bus.subscribe('core.task.moved', handler)

    bus.publish(event('coreXtaskYmoved'))
    await flush()

    expect(handler).not.toHaveBeenCalled()
  })
})
