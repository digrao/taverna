export interface NotificationMessage {
  text: string
  urgency?: 'info' | 'warning' | 'critical'
  project?: string
  agent?: string
  sessionId?: string
}

export interface Notifier {
  send(message: NotificationMessage): Promise<void>
}
