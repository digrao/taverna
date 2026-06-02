export interface ArchiveNote {
  filename: string
  body: string
  frontmatter: Record<string, unknown>
}

export interface MigrationTaskDraft {
  id: string
  title: string
  prioridade: 'high' | 'medium' | 'low'
  progresso: number
  body: string
}

export interface MigrationDraft {
  id: string
  tipo: '*' | 'USP' | 'BB'
  priority: 'high' | 'medium' | 'low'
  run_every: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'never'
  extraFrontmatter?: Record<string, unknown>
  body: string
  tasks: MigrationTaskDraft[]
}

export interface MigrationResult {
  projectPath: string
  tasksCreated: string[]
  draft?: MigrationDraft
}
