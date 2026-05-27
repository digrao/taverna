import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

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
  // Default agent per project tipo when project.agent is not set
  agentDefaults: Record<string, string>
  // Scheduler idle detection (minutes without Claude Code activity → consider idle)
  idleThresholdMinutes?: number
  // Default run_window when project does not specify one
  defaultRunWindow?: string
}

/** Load KEY=VALUE pairs from <vaultPath>/.env into process.env (non-destructive). */
function loadVaultEnv(vaultPath: string): void {
  const envFile = join(vaultPath, '.env')
  if (!existsSync(envFile)) return
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
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

export function defineConfig(
  overrides: Partial<TavernaConfig> & { vaultPath: string },
): TavernaConfig {
  loadVaultEnv(overrides.vaultPath)

  const copypartyUrl = overrides.copypartyUrl ?? process.env['COPYPARTY_URL']
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    vaultPath: overrides.vaultPath,
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
    ...(copypartyUrl !== undefined ? { copypartyUrl } : {}),
  }
}
