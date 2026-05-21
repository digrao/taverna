import type { ArchiveNote } from './types.js'

export function buildMigratePrompt(notes: ArchiveNote[], suggestedId: string): string {
  const noteBlocks = notes.map(n => {
    const fm = Object.keys(n.frontmatter).length > 0
      ? `Frontmatter: ${JSON.stringify(n.frontmatter)}\n`
      : ''
    return `### ${n.filename}\n${fm}${n.body}`
  }).join('\n\n---\n\n')

  return `You are helping migrate a set of scattered notes from an archive into a structured vault project.

## Vault project conventions

A project file uses YAML frontmatter with these fields:
- id: string (kebab-case or ALLCAPS, the project identifier)
- tipo: "USP" | "BB" | "*"  (USP=university course, BB=work/freelance, *=personal/meta)
- priority: "high" | "medium" | "low"
- run_every: "hourly" | "daily" | "weekly" | "monthly" | "never"  (how often an agent should review)
- agent: "@agent-name"  (optional, if an agent should run on this)

Tasks go in a tasks/ folder as separate .md files with frontmatter:
- prioridade: "high" | "medium" | "low"
- progresso: 0-100

## Archive notes to migrate

Project folder name: ${suggestedId}

${noteBlocks}

## Your job

Analyze all the notes above and produce a migration plan as a JSON object.

Rules:
- Synthesize the scattered ideas into a coherent project description (body field)
- Extract concrete, actionable tasks from the notes — each task must be specific and implementable
- Ignore vague/aspirational ideas that aren't actionable yet; keep only real tasks
- The body should be a clean markdown description of the project (no task lists, no checkboxes)
- Task ids must be unique kebab-case slugs
- progresso: 0 for not started, 50 for in progress, 100 for done

Output ONLY valid JSON inside a \`\`\`json code block. No explanation before or after.

\`\`\`json
{
  "id": "<kebab-case project id>",
  "tipo": "<USP|BB|*>",
  "priority": "<high|medium|low>",
  "run_every": "<daily|weekly|monthly|never>",
  "extraFrontmatter": {},
  "body": "<clean markdown project description>",
  "tasks": [
    {
      "id": "<kebab-slug>",
      "title": "<Task title>",
      "prioridade": "<high|medium|low>",
      "progresso": 0,
      "body": "<what needs to be done and why>"
    }
  ]
}
\`\`\`
`
}
