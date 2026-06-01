export type { Notifier, NotificationMessage } from './types.js'
export { ConsoleNotifier } from './console.js'
export { MatrixNotifier, matrixNotifierFromEnv } from './matrix.js'
export { NotificationBus, notificationBus } from './bus.js'

import { notificationBus } from './bus.js'
import { ConsoleNotifier } from './console.js'
import { matrixNotifierFromEnv } from './matrix.js'

// Register console notifier by default unless explicitly silenced.
if (process.env['TAVERNA_NOTIFIER'] !== 'none') {
  notificationBus.register(new ConsoleNotifier())
}

// Register Matrix notifier when MATRIX_HOMESERVER + MATRIX_ACCESS_TOKEN are set.
const matrixNotifier = matrixNotifierFromEnv()
if (matrixNotifier) {
  notificationBus.register(matrixNotifier)
}
