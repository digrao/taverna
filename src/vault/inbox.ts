import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { parseFrontmatter } from './frontmatter.js'
import type { InboxItem } from './types.js'

const INBOX_DIR = '00_Inbox'

export async function readInbox(vaultPath: string): Promise<InboxItem[]> {
  const inboxDir = join(vaultPath, INBOX_DIR)
  if (!existsSync(inboxDir)) return []

  const entries = (await readdir(inboxDir)).filter((f) => f.endsWith('.md'))
  const items: InboxItem[] = []
  for (const file of entries) {
    const filePath = join(inboxDir, file)
    const raw = await readFile(filePath, 'utf8')
    const { data, content } = parseFrontmatter(raw)
    items.push({ filePath, raw: data, body: content.trim() })
  }
  return items
}
