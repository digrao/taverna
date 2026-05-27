export type { Notifier, NotificationMessage } from './types.js'
export { MatrixNotifier } from './matrix.js'
export { ConsoleNotifier } from './console.js'

import type { Notifier } from './types.js'
import { MatrixNotifier } from './matrix.js'
import { ConsoleNotifier } from './console.js'

/**
 * Resolve the active notifier from TAVERNA_NOTIFIER env var.
 *
 * TAVERNA_NOTIFIER=matrix   (default) — sends to Matrix room
 * TAVERNA_NOTIFIER=console  — prints to stderr, useful for development
 * TAVERNA_NOTIFIER=none     — silences all notifications
 */
export function getNotifier(): Notifier {
  const backend = process.env['TAVERNA_NOTIFIER'] ?? 'matrix'
  switch (backend) {
    case 'matrix':
      return new MatrixNotifier()
    case 'console':
      return new ConsoleNotifier()
    case 'none':
      return { async send() {} }
    default:
      process.stderr.write(
        `[notifications] unknown backend "${backend}", falling back to console\n`,
      )
      return new ConsoleNotifier()
  }
}
