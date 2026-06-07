import { execFile } from 'node:child_process'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import matter from 'gray-matter'
import { getStringArray } from './vault/frontmatter.js'

const exec = promisify(execFile)

interface ChangelogEntry {
  version: string
  date: string | undefined
  section: string
  tag: string | undefined
  text: string
}

const VERSION_HEADING_RE = /^## \[([^\]]+)\](?:\s*—\s*(.+))?\s*$/
const SECTION_HEADING_RE = /^### (.+)/
const ENTRY_RE = /^- (?:\[([a-z0-9-]+)\]\s*)?(.+)/

function parseChangelog(content: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = []
  let version: string | undefined
  let date: string | undefined
  let section: string | undefined

  for (const line of content.split('\n')) {
    const versionMatch = line.match(VERSION_HEADING_RE)
    if (versionMatch) {
      version = versionMatch[1]
      date = versionMatch[2]?.trim()
      section = undefined
      continue
    }
    const sectionMatch = line.match(SECTION_HEADING_RE)
    if (sectionMatch) {
      section = sectionMatch[1]?.trim()
      continue
    }
    const entryMatch = line.match(ENTRY_RE)
    if (entryMatch && version !== undefined && section !== undefined) {
      entries.push({ version, date, section, tag: entryMatch[1], text: entryMatch[2]!.trim() })
    }
  }

  return entries
}

/** Renames `[unreleased]` (any casing/spacing inside the brackets) to `[<version>] — <date>`. */
function renameUnreleased(changelog: string, version: string, date: string): string {
  const lines = changelog.split('\n')
  const index = lines.findIndex((line) => /^## \[.*unreleased.*\]/i.test(line))
  if (index === -1) throw new Error('CHANGELOG.md has no [unreleased] section')

  const next = lines.findIndex((line, i) => i > index && /^## \[/.test(line))
  const body = lines.slice(index + 1, next === -1 ? undefined : next)
  if (!body.some((line) => /^- /.test(line))) {
    throw new Error('[unreleased] has no entries — nothing to release')
  }

  lines[index] = `## [${version}] — ${date}`
  return lines.join('\n')
}

const CHANGELOG_BLOCK_MARKER = '<!-- gerado por taverna release — não editar manualmente -->'

function renderChangelogBlock(entries: ChangelogEntry[]): string {
  const byVersion = new Map<string, ChangelogEntry[]>()
  for (const entry of entries) {
    const list = byVersion.get(entry.version) ?? []
    list.push(entry)
    byVersion.set(entry.version, list)
  }

  const lines = ['## Changelog', '', CHANGELOG_BLOCK_MARKER]
  for (const [version, versionEntries] of byVersion) {
    const date = versionEntries[0]?.date
    lines.push('', `### [${version}]${date ? ` — ${date}` : ''}`)

    const bySection = new Map<string, ChangelogEntry[]>()
    for (const entry of versionEntries) {
      const list = bySection.get(entry.section) ?? []
      list.push(entry)
      bySection.set(entry.section, list)
    }
    for (const [section, sectionEntries] of bySection) {
      lines.push('', `**${section}**`, '')
      for (const entry of sectionEntries) lines.push(`- ${entry.text}`)
    }
  }

  return lines.join('\n').trimEnd() + '\n'
}

/** Replaces the `## Changelog` block (through the next `##` heading or EOF); appends one if absent. */
function replaceChangelogBlock(content: string, block: string): string {
  const headingMatch = content.match(/^## Changelog\b.*$/m)
  if (!headingMatch || headingMatch.index === undefined) {
    return `${content.replace(/\n+$/, '')}\n\n${block}`
  }

  const start = headingMatch.index
  const after = content.slice(start + headingMatch[0].length)
  const nextHeading = after.match(/^## /m)
  const end = nextHeading?.index !== undefined ? start + headingMatch[0].length + nextHeading.index : content.length

  return content.slice(0, start) + block + '\n' + content.slice(end)
}

async function gitCommit(dir: string, message: string): Promise<void> {
  await exec('git', ['-C', dir, 'add', '-A'])
  await exec('git', ['-C', dir, 'commit', '-m', message])
}

export interface ReleaseResult {
  version: string
  date: string
  updatedPages: string[]
}

/**
 * Cuts a release per spec 6: renames `[unreleased]` → `[<version>] — <date>` in
 * CHANGELOG.md, propagates matching entries (by `changelog-tags`) into each wiki
 * page's `## Changelog` block, then commits the wiki and the main repo and tags it.
 */
export async function release(repoDir: string, wikiDir: string, version: string): Promise<ReleaseResult> {
  const changelogPath = join(repoDir, 'CHANGELOG.md')
  const original = await readFile(changelogPath, 'utf8')
  const date = new Date().toISOString().slice(0, 10)
  const updated = renameUnreleased(original, version, date)
  await writeFile(changelogPath, updated, 'utf8')

  const entries = parseChangelog(updated)
  const updatedPages: string[] = []

  for (const file of (await readdir(wikiDir)).filter((f) => f.endsWith('.md'))) {
    const pagePath = join(wikiDir, file)
    const parsed = matter(await readFile(pagePath, 'utf8'))
    const tags = getStringArray(parsed.data, 'changelog-tags')
    if (tags.length === 0) continue

    const matching = entries.filter((e) => e.tag !== undefined && tags.includes(e.tag))
    const content = replaceChangelogBlock(parsed.content, renderChangelogBlock(matching))
    await writeFile(pagePath, matter.stringify(content, parsed.data), 'utf8')
    updatedPages.push(file)
  }

  await gitCommit(wikiDir, `release: ${version}`)
  await gitCommit(repoDir, `release: ${version}`)
  await exec('git', ['-C', repoDir, 'tag', `v${version}`])

  return { version, date, updatedPages }
}
