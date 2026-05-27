import type { Notifier, NotificationMessage } from './types.js'
import { matrixConfigFromEnv, sendMatrixMessage } from '../pm/matrix.js'

export class MatrixNotifier implements Notifier {
  async send(message: NotificationMessage): Promise<void> {
    const config = matrixConfigFromEnv()
    if (!config) return
    await sendMatrixMessage(config, message.text).catch((e: unknown) => {
      process.stderr.write(`[matrix] send failed: ${e instanceof Error ? e.message : String(e)}\n`)
    })
  }
}
