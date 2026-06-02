import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { TavernaContext } from './types.js'
import { scanVault } from '../vault/index.js'
import { readLogbook } from '../vault/logbook.js'

interface RunEntry {
  agent: string
  project: string
  success: boolean | undefined
  duration: number | undefined
  ts: string
}

export async function generateReport(
  params: { hours?: number },
  ctx: TavernaContext,
): Promise<{ markdown: string; runs: number; outPath?: string }> {
  const hours = params.hours ?? 24
  const cutoff = new Date(Date.now() - hours * 3_600_000)
  const state = await scanVault(ctx.config)

  const pad = (n: number) => String(n).padStart(2, '0')
  const today = new Date()
  const dateStr = `${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`

  const runs: RunEntry[] = []
  for (const agent of state.agents) {
    const entries = await readLogbook(agent.id, ctx.config)
    for (const e of entries) {
      if (new Date(e.timestamp) >= cutoff) {
        runs.push({
          agent: agent.id,
          project: e.projectName,
          success: e.success,
          duration: e.duration,
          ts: e.timestamp,
        })
      }
    }
  }

  runs.sort((a, b) => a.ts.localeCompare(b.ts))

  const successes = runs.filter((r) => r.success === true).length
  const failures = runs.filter((r) => r.success === false).length
  const avgDur =
    runs.filter((r) => r.duration).reduce((s, r) => s + (r.duration ?? 0), 0) /
    (runs.filter((r) => r.duration).length || 1)

  const lines = [
    `# Report — ${dateStr} (últimas ${hours}h)`,
    '',
    `**Runs:** ${runs.length}  ·  **Sucesso:** ${successes}  ·  **Falhas:** ${failures}  ·  **Duração média:** ${avgDur.toFixed(1)}s`,
    '',
  ]

  if (failures > 0) {
    lines.push('## Falhas')
    for (const r of runs.filter((r) => r.success === false)) {
      lines.push(`- ✗ **${r.project}** via ${r.agent} @ ${r.ts.slice(11, 16)}`)
    }
    lines.push('')
  }

  lines.push('## Execuções')
  for (const r of runs) {
    const icon = r.success === true ? '✓' : r.success === false ? '✗' : '·'
    const dur = r.duration ? ` (${r.duration.toFixed(1)}s)` : ''
    lines.push(`- ${icon} **${r.project}** via ${r.agent}${dur} @ ${r.ts.slice(11, 16)}`)
  }

  if (runs.length === 0) lines.push('_Nenhuma execução registrada no período._')

  const markdown = lines.join('\n') + '\n'

  if (!ctx.dryRun) {
    const outPath = join(ctx.vaultPath, '60_Agents', '5_Inbox', `${dateStr}-report.md`)
    await writeFile(outPath, markdown, 'utf8')
    return { markdown, runs: runs.length, outPath }
  }

  return { markdown, runs: runs.length }
}
