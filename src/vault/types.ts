export type RawFrontmatter = Record<string, unknown>

export type Priority = 'high' | 'medium' | 'low'

export type RunEvery = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'never'

export type TaskState =
  | 'backlog'
  | 'tarefinha'
  | 'tarefa'
  | 'em-progresso'
  | 'aguardando_humano'
  | 'bloqueada'
  | 'concluida'

export type UspTaskType = 'USP-aula' | 'USP-entrega'

export type ProjectType = 'USP' | 'BB' | '*'

export interface AgentRunner {
  type: 'claude' | 'ollama'
  model?: string
}

export interface VaultTask {
  id: string
  filePath: string
  title: string
  progresso: number
  prioridade: Priority
  deadline?: string
  assetFolder?: string
  state: TaskState
  // USP task classification
  taskType?: UspTaskType
  pipelineStage?: string // pipeline.stage from frontmatter
  workspace?: string // workspace: path for USP-entrega
  parent?: string // parent discipline id
  // Artefatos que o humano precisa entregar antes de o agente prosseguir
  requerHumano?: string[]
  // Bloqueio técnico detectado pelo agente
  bloqueio?: string
  bloqueioDetalhe?: string
  // Dependency IDs from `depende:` or `depends_on:` frontmatter field
  depends?: string[]
  // 'human' = must be done by a human; '@agent-name' = pinned to a specific agent
  assignee?: string
  body: string
  raw: RawFrontmatter
}

export interface VaultAgent {
  id: string
  folderName: string
  description?: string
  runner: AgentRunner
  directiveText: string
  directivesPath: string
  // Explicit tool allowlist declared in directive frontmatter.
  // When set, executor uses --allowedTools instead of bypassPermissions.
  permissions?: string[]
}

export interface VaultProject {
  id: string
  tipo: ProjectType
  name: string
  filePath: string
  folderPath?: string
  priority: Priority
  agent?: string
  runEvery: RunEvery
  lastRun?: string
  lastStatus?: 'success' | 'failed'
  runsTotal: number
  pipeline?: string[]
  tasks: VaultTask[]
  hasTasksFolder: boolean
  hasAssetsFolder: boolean
  isGitRepo: boolean
  isSubmodule: boolean
  content: string
  raw: RawFrontmatter
  // multi-host scheduling
  hostname?: string
  workspaceDir?: string
  // USP-specific (optional)
  edisciplinas?: string
  horarios?: Array<{ dia: string; hora?: string; local?: string }>
  contatos?: string[]
  // BB-specific (optional)
  cardId?: string
  source?: string[]
}

export interface LogbookEntry {
  timestamp: string
  projectName: string
  content: string
  success?: boolean
  duration?: number
}

export interface VaultState {
  projects: VaultProject[]
  agents: VaultAgent[]
  scannedAt: Date
  vaultPath: string
}
