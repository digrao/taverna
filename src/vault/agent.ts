import { readdir, readFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { existsSync } from 'node:fs'
import { parseFrontmatter, getString } from './frontmatter.js'
import type { VaultAgent, AgentRunner } from './types.js'

export async function readAgent(folderPath: string): Promise<VaultAgent> {
  const directivesPath = join(folderPath, 'directives.md')
  const raw = await readFile(directivesPath, 'utf8')
  const { data, content } = parseFrontmatter(raw)

  const folderName = basename(folderPath)
  const id = getString(data, 'name') ?? `@${folderName}`
  const description = getString(data, 'description')

  const runnerType = getString(data, 'runner')
  const model = getString(data, 'model')

  const runner: AgentRunner = {
    type: runnerType === 'ollama' ? 'ollama' : 'claude',
    ...(model != null ? { model } : {}),
  }

  return {
    id,
    folderName,
    ...(description != null ? { description } : {}),
    runner,
    directiveText: content.trim(),
    directivesPath,
  }
}

export async function discoverAgents(directivesDir: string): Promise<VaultAgent[]> {
  if (!existsSync(directivesDir)) return []

  const entries = await readdir(directivesDir)
  const agents: VaultAgent[] = []

  for (const entry of entries) {
    const directivesPath = join(directivesDir, entry, 'directives.md')
    if (existsSync(directivesPath)) {
      agents.push(await readAgent(join(directivesDir, entry)))
    }
  }

  return agents
}
