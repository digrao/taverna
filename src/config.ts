import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface TavernaConfig {
  vaultPath: string
  projectsDir: string
  directivesDir: string
  logbooksDir: string
  morningOutputDir: string
  morningFilename: (date: Date) => string
  uspFolderPrefixes: string[]
  scheduledDir: string
  assetExtensions: string[]
  copypartyUrl?: string
  gdriveRemote: string
  gdriveBasePath: string
  agentDefaults: Record<string, string>
  idleThresholdMinutes?: number
  defaultRunWindow?: string
  policiesPath: string
}

const SYSTEM_ENV = join(homedir(), '.config', 'taverna', '.env')

/** Load KEY=VALUE pairs from a file into process.env (non-destructive). */
function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '')
    if (key && !(key in process.env)) process.env[key] = val
  }
}

/**
 * Resolve vault path from, in order:
 *   1. explicit override
 *   2. VAULT_PATH env var
 *   3. ~/.config/taverna/.env
 */
export function resolveVaultPath(override?: string): string {
  if (override) return override
  // Load system config before checking env so it can supply VAULT_PATH
  loadEnvFile(SYSTEM_ENV)
  const vaultPath = process.env['VAULT_PATH']
  if (!vaultPath) {
    throw new Error(
      'Vault path not configured. Set VAULT_PATH env var or add it to ~/.config/taverna/.env',
    )
  }
  return vaultPath
}

export function defineConfig(
  overrides: Partial<TavernaConfig> & { vaultPath?: string } = {},
): TavernaConfig {
  const vaultPath = resolveVaultPath(overrides.vaultPath)

  // Load vault-local .env on top (non-destructive, so system env wins)
  loadEnvFile(join(vaultPath, '.env'))

  const copypartyUrl = overrides.copypartyUrl ?? process.env['COPYPARTY_URL']
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    vaultPath,
    projectsDir: overrides.projectsDir ?? '10_Projects',
    directivesDir: overrides.directivesDir ?? '60_Agents/1_Directives',
    logbooksDir: overrides.logbooksDir ?? '60_Agents/2_Logbooks',
    morningOutputDir: overrides.morningOutputDir ?? '60_Agents/5_Inbox',
    morningFilename:
      overrides.morningFilename ??
      ((d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-morning.md`),
    uspFolderPrefixes: overrides.uspFolderPrefixes ?? ['PSI', 'PEA', 'PEF'],
    scheduledDir: overrides.scheduledDir ?? '60_Agents/5_Schedueled',
    assetExtensions: overrides.assetExtensions ?? [
      'pdf',
      'ppt',
      'pptx',
      'zip',
      'docx',
      'mat',
      'vhd',
      'jpg',
      'jpeg',
      'png',
      'gif',
      'bmp',
      'webp',
      'svg',
    ],
    gdriveRemote: overrides.gdriveRemote ?? 'jv',
    gdriveBasePath: overrides.gdriveBasePath ?? 'obsidian',
    agentDefaults: overrides.agentDefaults ?? {
      USP: '@study-assistant',
      BB: '@planner',
      '*': '@dev-agent',
    },
    ...(overrides.idleThresholdMinutes !== undefined
      ? { idleThresholdMinutes: overrides.idleThresholdMinutes }
      : {}),
    ...(overrides.defaultRunWindow !== undefined
      ? { defaultRunWindow: overrides.defaultRunWindow }
      : {}),
    policiesPath: overrides.policiesPath ?? process.env['TAVERNA_POLICIES'] ?? 'policies.yaml',
    ...(copypartyUrl !== undefined ? { copypartyUrl } : {}),
  }
}

/** Zero-argument config loader — resolves vault path automatically. */
export function loadConfig(overrides: Partial<TavernaConfig> = {}): TavernaConfig {
  return defineConfig(overrides)
}
