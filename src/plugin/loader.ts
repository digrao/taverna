import { coreCommands } from '../core/index.js'
import type { TavernaConfig } from '../config.js'
import type { NotificationBus } from '../notifications/bus.js'
import type { HttpRoute, TavernaPlugin } from './types.js'

/** "taverna-assets" → "assets"; an explicit `namespace` always wins. */
export function deriveNamespace(plugin: TavernaPlugin): string {
  if (plugin.namespace !== undefined) return plugin.namespace
  return plugin.name.startsWith('taverna-') ? plugin.name.slice('taverna-'.length) : plugin.name
}

export interface LoadedPlugins {
  plugins: TavernaPlugin[]
  httpRoutes: HttpRoute[]
}

/**
 * Loads plugins declared in `config.plugins`, registers their commands into the
 * core registry under the derived namespace, and collects their raw HTTP routes.
 * Plugins that fail to load (or lack a default export with `name`) are logged
 * and skipped — they never crash the core.
 */
export async function loadPlugins(
  config: TavernaConfig,
  notificationBus: NotificationBus,
): Promise<LoadedPlugins> {
  const plugins: TavernaPlugin[] = []
  const httpRoutes: HttpRoute[] = []

  for (const entry of config.plugins) {
    if (!entry.enabled) continue

    try {
      const mod = await import(entry.path)
      const plugin = mod.default as TavernaPlugin
      if (!plugin?.name) {
        process.stderr.write(`[plugin] ${entry.path}: missing default export with "name"\n`)
        continue
      }

      const namespace = deriveNamespace(plugin)
      for (const command of plugin.commands ?? []) {
        coreCommands.register(command, namespace)
      }
      httpRoutes.push(...(plugin.httpRoutes ?? []))

      plugin.onLoad?.({ config, notificationBus })
      plugins.push(plugin)
      process.stderr.write(`[plugin] loaded: ${plugin.name} (namespace: ${namespace})\n`)
    } catch (e) {
      process.stderr.write(
        `[plugin] failed to load ${entry.path}: ${e instanceof Error ? e.message : String(e)}\n`,
      )
    }
  }

  return { plugins, httpRoutes }
}
