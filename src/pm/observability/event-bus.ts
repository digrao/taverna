export interface TavernaEvent {
  event: string
  [key: string]: unknown
}

export interface EventBus {
  emit(event: TavernaEvent): void
  close?(): Promise<void>
}

// StdoutBus: current default — JSON lines to stdout → journal → Loki
export class StdoutBus implements EventBus {
  emit(event: TavernaEvent): void {
    process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n')
  }
}

// KafkaBus placeholder — swap in when broker is available
// import { Kafka } from 'kafkajs'
// export class KafkaBus implements EventBus { ... }

let _bus: EventBus = new StdoutBus()

export function setEventBus(bus: EventBus): void {
  _bus = bus
}

export function emitEvent(event: TavernaEvent): void {
  _bus.emit(event)
}
