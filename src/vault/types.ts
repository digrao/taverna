export type RawFrontmatter = Record<string, unknown>

export interface VaultTask {
  id: string
  filePath: string
  title: string
  /** Current state — matched against a node id in the task flow canvas */
  status?: string
  progresso: number
  /** IDs of tasks this one depends on (`depende:` frontmatter) */
  depends?: string[]
  body: string
  raw: RawFrontmatter
}

export interface VaultProject {
  id: string
  name: string
  filePath: string
  folderPath: string
  tipo?: string
  /** Current state — matched against a node id in the project flow canvas */
  status?: string
  tasks: VaultTask[]
  content: string
  raw: RawFrontmatter
}

export interface InboxItem {
  filePath: string
  raw: RawFrontmatter
  body: string
}
