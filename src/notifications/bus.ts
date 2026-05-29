import type { Notifier, NotificationMessage } from './types.js'

export class NotificationBus {
  private notifiers: Notifier[] = []

  register(notifier: Notifier): void {
    this.notifiers.push(notifier)
  }

  async send(message: NotificationMessage): Promise<void> {
    await Promise.allSettled(this.notifiers.map((n) => n.send(message)))
  }
}

export const notificationBus = new NotificationBus()
