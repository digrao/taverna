import { readFile, appendFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import type { LogbookEntry } from './types.js'
import type { TavernaConfig } from '../config.js'

// Formats:
// 1. ## [2026-05-19T14:14:05.847151] ProjectName   (executor)
// 2. ## 2026-05-19 14:17 — ProjectName             (study-assistant)
const EXECUTOR_RE = /^## \[([^\]]+)\]\s+(.+)$/
const STUDY_RE = /^## (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})\s+[—–-]\s+(.+)$/

function agentFileName(agentId: string): string {
  return agentId.startsWith('@') ? `${agentId.slice(1)}.md` : `${agentId}.md`
}

function parseSuccess(content: string): boolean | undefined {
  const match = content.match(/\*\*Success:\*\*\s*(true|false)/i)
  if (!match) return undefined
  return match[1]!.toLowerCase() === 'true'
}

function parseDuration(content: string): number | undefined {
  const match = content.match(/\*\*Duration:\*\*\s*([\d.]+)s/)
  if (!match) return undefined
  return parseFloat(match[1]!)
}

export async function readLogbook(agentId: string, config: TavernaConfig): Promise<LogbookEntry[]> {
  const logbooksDir = join(config.vaultPath, config.logbooksDir)
  const filePath = join(logbooksDir, agentFileName(agentId))
  if (!existsSync(filePath)) return []

  const raw = await readFile(filePath, 'utf8')
  const entries: LogbookEntry[] = []

  // Split on h2 headings (keep delimiter)
  const sections = raw.split(/(?=^## )/m).filter((s) => s.trim())

  for (const section of sections) {
    const firstLine = section.split('\n')[0] ?? ''
    const body = section.split('\n').slice(1).join('\n').trim()

    let timestamp: string | undefined
    let projectName: string | undefined

    const exMatch = EXECUTOR_RE.exec(firstLine)
    if (exMatch) {
      timestamp = exMatch[1]!
      projectName = exMatch[2]!.trim()
    } else {
      const stMatch = STUDY_RE.exec(firstLine)
      if (stMatch) {
        timestamp = `${stMatch[1]!}T${stMatch[2]!}:00`
        projectName = stMatch[3]!.trim()
      }
    }

    if (timestamp && projectName) {
      const entry: LogbookEntry = { timestamp, projectName, content: body }
      const s = parseSuccess(body)
      if (s !== undefined) entry.success = s
      const d = parseDuration(body)
      if (d !== undefined) entry.duration = d
      entries.push(entry)
    }
  }

  return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}

export async function appendLogbook(
  agentId: string,
  entry: Omit<LogbookEntry, 'timestamp'>,
  config: TavernaConfig,
): Promise<void> {
  const logbooksDir = join(config.vaultPath, config.logbooksDir)
  await mkdir(logbooksDir, { recursive: true })
  const filePath = join(logbooksDir, agentFileName(agentId))
  const timestamp = new Date().toISOString()
  const heading = `## [${timestamp}] ${entry.projectName}\n`
  const body = entry.content ? `${entry.content}\n` : ''
  await appendFile(filePath, `\n${heading}${body}`, 'utf8')
}

export async function appendProjectLogbook(
  projectFolderPath: string,
  entry: Omit<LogbookEntry, 'timestamp'>,
): Promise<void> {
  const filePath = join(projectFolderPath, 'logbook.md')
  const timestamp = new Date().toISOString()

  // Create with header if new
  const { existsSync } = await import('node:fs')
  if (!existsSync(filePath)) {
    const projectId = entry.projectName
    await writeFile(
      filePath,
      `# Logbook — ${projectId}\n\n<!-- append entries below; newest at bottom -->\n`,
      'utf8',
    )
  }

  const heading = `## [${timestamp}] ${entry.projectName}\n`
  const body = entry.content ? `${entry.content}\n` : ''
  await appendFile(filePath, `\n${heading}${body}`, 'utf8')
}
