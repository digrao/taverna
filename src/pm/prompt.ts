import type { VaultProject, VaultAgent } from '../vault/types.js'

export function buildPrompt(agent: VaultAgent, project: VaultProject, maxChars: number): string {
  const header = [
    `# Agent Task`,
    ``,
    `Project: ${project.id}`,
    `Type: ${project.tipo}`,
    ``,
    `## Directives`,
    ``,
    agent.directiveText,
    ``,
    `## Project Context`,
    ``,
  ].join('\n')

  const available = Math.max(0, maxChars - header.length)
  return header + project.content.slice(0, available)
}
