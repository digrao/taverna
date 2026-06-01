export type { Notifier, NotificationMessage } from './types.js'
export { ConsoleNotifier } from './console.js'
export {
  MatrixNotifier,
  matrixNotifierFromEnv,
  type MatrixRoom,
  type MatrixConfig,
} from './matrix.js'
export { NotificationBus, notificationBus } from './bus.js'

import { notificationBus } from './bus.js'
import { ConsoleNotifier } from './console.js'

// Console notifier is always active unless explicitly silenced.
if (process.env['TAVERNA_NOTIFIER'] !== 'none') {
  notificationBus.register(new ConsoleNotifier())
}
