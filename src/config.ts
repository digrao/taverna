import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface PluginConfigEntry {
  /** Absolute path to the plugin's compiled entry point */
  path: string
  enabled: boolean
}

export interface TavernaConfig {
  /** Absolute path to the vault this instance operates on */
  vaultPath: string
  /** Projects directory, relative to vaultPath */
  projectsDir: string
  /** Directory of flow canvases and their node schemas */
  flowDir: string
  /** HTTP server port (taverna serve) */
  port: number
  /** Active plugins */
  plugins: PluginConfigEntry[]
  /** Plugin-declared sub-config, keyed by namespace */
  [namespace: string]: unknown
}

const DEFAULT_CONFIG_PATH = join(homedir(), '.config', 'taverna', 'config.json')

/**
 * Resolves the config file path. The config is located first — it is what tells
 * taverna where the vault is, never the other way around.
 *   1. --config <path>
 *   2. fixed default path (~/.config/taverna/config.json)
 */
export function resolveConfigPath(override?: string): string {
  return override ?? DEFAULT_CONFIG_PATH
}

export function loadConfig(override?: string): TavernaConfig {
  const path = resolveConfigPath(override)
  if (!existsSync(path)) {
    throw new Error(`Config not found at ${path}. Create it or pass --config <path>.`)
  }

  const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<TavernaConfig>
  for (const field of ['vaultPath', 'projectsDir', 'flowDir'] as const) {
    if (!raw[field]) {
      throw new Error(`Config at ${path} is missing required field "${field}"`)
    }
  }

  return {
    ...raw,
    vaultPath: raw.vaultPath,
    projectsDir: raw.projectsDir,
    flowDir: raw.flowDir,
    port: raw.port ?? 3861,
    plugins: raw.plugins ?? [],
  } as TavernaConfig
}
