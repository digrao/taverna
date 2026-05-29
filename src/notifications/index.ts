export type { Notifier, NotificationMessage } from './types.js'
export { ConsoleNotifier } from './console.js'
export { NotificationBus, notificationBus } from './bus.js'

import { notificationBus } from './bus.js'
import { ConsoleNotifier } from './console.js'

// Register console notifier by default unless explicitly silenced.
// Plugins register additional notifiers (e.g. Matrix) via onLoad.
if (process.env['TAVERNA_NOTIFIER'] !== 'none') {
  notificationBus.register(new ConsoleNotifier())
}
