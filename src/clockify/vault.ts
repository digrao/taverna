import { readFile, writeFile } from 'node:fs/promises'
import matter from 'gray-matter'
import type { DeepWorkStats } from './types.js'

export async function writeDeepWorkToFrontmatter(
  filePath: string,
  stats: DeepWorkStats,
): Promise<void> {
  const raw = await readFile(filePath, 'utf8')
  const parsed = matter(raw)
  parsed.data['deepwork_total_h'] = stats.totalHours
  parsed.data['deepwork_week_h'] = stats.weekHours
  parsed.data['deepwork_last'] = stats.lastEntry
  await writeFile(filePath, matter.stringify(parsed.content, parsed.data), 'utf8')
}
