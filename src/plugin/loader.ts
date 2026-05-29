import type { TavernaPlugin } from './types.js'
import { notificationBus } from '../notifications/bus.js'

/**
 * Discovers and loads plugins from TAVERNA_PLUGINS env var.
 *
 * TAVERNA_PLUGINS is a colon-separated list of absolute paths to plugin entry points:
 *   TAVERNA_PLUGINS=/home/user/tools/taverna-assets/dist/index.js:/home/user/tools/taverna-blog/dist/index.js
 *
 * Each entry point must export a default TavernaPlugin object.
 * Plugins that fail to load are logged and skipped — they never crash taverna.
 */
export async function loadPlugins(): Promise<TavernaPlugin[]> {
  const pluginPaths = (process.env['TAVERNA_PLUGINS'] ?? '')
    .split(':')
    .map((p) => p.trim())
    .filter(Boolean)

  if (pluginPaths.length === 0) return []

  const plugins: TavernaPlugin[] = []

  for (const pluginPath of pluginPaths) {
    try {
      const mod = await import(pluginPath)
      const plugin = mod.default as TavernaPlugin
      if (!plugin?.name) {
        process.stderr.write(`[plugin] ${pluginPath}: missing default export with name field\n`)
        continue
      }
      plugin.onLoad?.(notificationBus)
      plugins.push(plugin)
      process.stderr.write(`[plugin] loaded: ${plugin.name}\n`)
    } catch (e) {
      process.stderr.write(
        `[plugin] failed to load ${pluginPath}: ${e instanceof Error ? e.message : String(e)}\n`,
      )
    }
  }

  return plugins
}

export function collectPluginFeatures(plugins: TavernaPlugin[]) {
  return plugins.flatMap((p) => p.features ?? [])
}

export function collectPluginRoutes(plugins: TavernaPlugin[]) {
  return plugins.flatMap((p) => p.httpRoutes ?? [])
}

export async function loadPluginFeatures() {
  return collectPluginFeatures(await loadPlugins())
}
