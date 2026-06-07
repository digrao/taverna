export type {
  TavernaContext,
  CommandDef,
  RegisteredCommand,
  CommandResult,
  JsonSchema,
  Protocol,
} from './types.js'
export { CommandRegistry } from './types.js'

import { CommandRegistry } from './types.js'
import { vaultCommands } from './vault-commands.js'
import { taskCommands } from './task-commands.js'
import { flowCommands } from './flow/index.js'

/** All core commands — registered across HTTP, MCP, and CLI by the protocol adapters. */
export const coreCommands = new CommandRegistry()

for (const def of [...vaultCommands, ...taskCommands, ...flowCommands]) {
  coreCommands.register(def)
}
