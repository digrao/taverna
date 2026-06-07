import { Ajv } from 'ajv'
import type { TavernaConfig } from '../config.js'
import type { NotificationBus } from '../notifications/bus.js'

const ajv = new Ajv({ allErrors: true, strict: false })

export interface TavernaContext {
  config: TavernaConfig
  notificationBus: NotificationBus
  /** Optional interactive prompter for fields the flow pipeline can't resolve on its own (CLI-only, typically) */
  prompt?: (field: string) => Promise<string>
}

/** JSON Schema describing a command's params — not a Zod shape. */
export type JsonSchema = Record<string, unknown>

export type Protocol = 'http' | 'mcp' | 'cli'

export interface CommandDef {
  id: string
  description: string
  params?: JsonSchema
  /** Protocols this command is published on. Omit for all three; [] to publish on none. */
  expose?: Protocol[]
  handler: (params: Record<string, unknown>, ctx: TavernaContext) => Promise<unknown>
}

/** A command as known to the registry — carries the namespace it was registered under, if any. */
export interface RegisteredCommand extends CommandDef {
  namespace?: string
}

export interface CommandResult<T = unknown> {
  data?: T
  error?: string
}

function isExposedOn(cmd: CommandDef, protocol: Protocol): boolean {
  return cmd.expose === undefined || cmd.expose.includes(protocol)
}

export class CommandRegistry {
  private commands: RegisteredCommand[] = []

  /** Registers a command. Core commands omit `namespace`; plugin commands provide it. */
  register(def: CommandDef, namespace?: string): void {
    this.commands.push(namespace !== undefined ? { ...def, namespace } : { ...def })
  }

  find(namespace: string | undefined, id: string): RegisteredCommand | undefined {
    return this.commands.find((c) => c.namespace === namespace && c.id === id)
  }

  list(): RegisteredCommand[] {
    return [...this.commands]
  }

  listFor(protocol: Protocol): RegisteredCommand[] {
    return this.commands.filter((c) => isExposedOn(c, protocol))
  }

  async execute(
    namespace: string | undefined,
    id: string,
    params: Record<string, unknown>,
    ctx: TavernaContext,
  ): Promise<CommandResult> {
    const cmd = this.find(namespace, id)
    if (!cmd) {
      const fullId = namespace ? `${namespace}.${id}` : id
      return { error: `Command not found: ${fullId}` }
    }

    if (cmd.params) {
      const validate = ajv.compile(cmd.params)
      if (!validate(params)) {
        return { error: ajv.errorsText(validate.errors) }
      }
    }

    try {
      return { data: await cmd.handler(params, ctx) }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  }
}
