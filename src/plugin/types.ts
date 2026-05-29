import type { Command } from 'commander'
import type { FeatureDef, FeatureContext } from '../infra/feature-map.js'
import type { AgentResult } from '../pm/executor.js'
import type { VaultProject } from '../vault/types.js'

/**
 * A taverna plugin contributes features (MCP tools + HTTP routes), optional CLI
 * commands, and optional scheduler lifecycle hooks.
 *
 * Minimal plugin example:
 *
 *   export default {
 *     name: 'my-plugin',
 *     features: [{ name: 'ping', description: '...', params: {}, httpMethod: 'GET',
 *                  handler: async () => ({ pong: true }) }],
 *   } satisfies TavernaPlugin
 */
export interface TavernaPlugin {
  /** Unique plugin name — used in logs and error messages */
  name: string

  /** Features exposed as MCP tools and HTTP routes */
  features?: FeatureDef[]

  /**
   * Optional CLI commands this plugin contributes.
   * Called with the root Commander program so the plugin can attach subcommands.
   */
  registerCommands?: (program: Command, ctx: FeatureContext) => void

  /**
   * Called once at the start of each scheduler tick, before vault scan.
   * Use for pre-tick sync work (e.g. clockify hours → project frontmatters).
   */
  beforeTick?: (ctx: FeatureContext) => Promise<void>

  /**
   * Called after each agent run completes (not called in dry-run mode).
   * Use for post-run side effects (e.g. asset uploads, telemetry).
   */
  afterRun?: (result: AgentResult, project: VaultProject, ctx: FeatureContext) => Promise<void>
}
