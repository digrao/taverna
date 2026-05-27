import type { Notifier, NotificationMessage } from './types.js'

export class ConsoleNotifier implements Notifier {
  async send(message: NotificationMessage): Promise<void> {
    const icon =
      message.urgency === 'critical' ? '🔴' : message.urgency === 'warning' ? '⚠️ ' : 'ℹ️ '
    process.stderr.write(`${icon} ${message.text}\n`)
  }
}
