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
}

export function defineConfig(overrides: Partial<TavernaConfig> & { vaultPath: string }): TavernaConfig {
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    vaultPath: overrides.vaultPath,
    projectsDir: overrides.projectsDir ?? '10_Projects',
    directivesDir: overrides.directivesDir ?? '60_Agents/1_Directives',
    logbooksDir: overrides.logbooksDir ?? '60_Agents/2_Logbooks',
    morningOutputDir: overrides.morningOutputDir ?? '60_Agents/5_Inbox',
    morningFilename: overrides.morningFilename ?? ((d) =>
      `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-morning.md`
    ),
    uspFolderPrefixes: overrides.uspFolderPrefixes ?? ['PSI', 'PEA', 'PEF'],
    scheduledDir: overrides.scheduledDir ?? '60_Agents/5_Schedueled',
    assetExtensions: overrides.assetExtensions ?? ['pdf', 'ppt', 'pptx', 'zip', 'docx', 'mat', 'vhd'],
    gdriveRemote: overrides.gdriveRemote ?? 'jv',
    gdriveBasePath: overrides.gdriveBasePath ?? 'obsidian',
    agentDefaults: overrides.agentDefaults ?? {
      'USP': '@study-assistant',
      'BB':  '@planner',
      '*':   '@dev-agent',
    },
    ...(overrides.copypartyUrl !== undefined ? { copypartyUrl: overrides.copypartyUrl } : {}),
  }
}
