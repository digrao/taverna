import type { Command } from 'commander'
import type { FeatureDef, FeatureContext } from '../infra/feature-map.js'

/**
 * A taverna plugin contributes features (MCP tools + HTTP routes) and optionally
 * CLI commands. Plugins are discovered via the TAVERNA_PLUGINS env var.
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
}
