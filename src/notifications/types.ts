export interface TavernaEvent {
  /** Namespaced: "core.task.moved", "<plugin-namespace>.<entity>.<action>" */
  type: string
  payload: unknown
  timestamp: string
}

export type EventHandler = (event: TavernaEvent) => void | Promise<void>
