import type { EventHandler, TavernaEvent } from './types.js'

interface Subscription {
  pattern: string
  handler: EventHandler
}

/** Translates a glob pattern ("core.*", "*") into a matcher for event types. */
function matchesPattern(pattern: string, type: string): boolean {
  const regex = new RegExp(
    '^' +
      pattern
        .split('*')
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*') +
      '$',
  )
  return regex.test(type)
}

/**
 * Internal event bus. The core publishes typed events; subscribers (SSE, plugins,
 * external transports) receive them and deliver on their own transport.
 * Delivery is best-effort — a failing subscriber never affects the others.
 */
export class NotificationBus {
  private subscriptions: Subscription[] = []

  publish(event: TavernaEvent): void {
    const matching = this.subscriptions.filter((s) => matchesPattern(s.pattern, event.type))
    void Promise.allSettled(matching.map((s) => s.handler(event)))
  }

  subscribe(pattern: string, handler: EventHandler): () => void {
    const subscription: Subscription = { pattern, handler }
    this.subscriptions.push(subscription)
    return () => {
      const index = this.subscriptions.indexOf(subscription)
      if (index !== -1) this.subscriptions.splice(index, 1)
    }
  }
}
