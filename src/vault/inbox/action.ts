import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export type ActionUrgency = 'low' | 'medium' | 'high'

export interface ActionRequest {
  projeto: string
  agente: string
  urgencia: ActionUrgency
  oQueAconteceu: string
  acoes: string[]
  contexto?: string
}

function timestamp(): string {
  return new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '')
}

function buildContent(req: ActionRequest): string {
  const ts = new Date().toISOString()
  const lines = [
    '---',
    `tipo: agent-action-required`,
    `projeto: ${req.projeto}`,
    `agente: ${req.agente}`,
    `timestamp: ${ts}`,
    `urgencia: ${req.urgencia}`,
    '---',
    `# Ação necessária — ${req.agente} em ${req.projeto}`,
    '',
    '## O que aconteceu',
    req.oQueAconteceu,
    '',
    '## O que precisa ser feito',
    ...req.acoes.map((a) => `- [ ] ${a}`),
  ]

  if (req.contexto) {
    lines.push('', '## Contexto', '```', req.contexto.slice(-800), '```')
  }

  return lines.join('\n') + '\n'
}

export async function writeActionRequest(vaultPath: string, req: ActionRequest): Promise<string> {
  const inboxDir = join(vaultPath, '00_Inbox')
  await mkdir(inboxDir, { recursive: true })

  const slug = `${timestamp()}-${req.projeto}-${req.agente.replace('@', '')}`
  const filePath = join(inboxDir, `${slug}.md`)
  await writeFile(filePath, buildContent(req), 'utf8')
  return filePath
}

export function parseActionRequired(output: string): string | undefined {
  const line = output.split('\n').find((l) => l.startsWith('ACTION_REQUIRED:'))
  return line ? line.replace(/^ACTION_REQUIRED:\s*/, '').trim() || undefined : undefined
}
