import { readdir, readFile, writeFile, copyFile, mkdir, stat } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import matter from 'gray-matter'

export interface PostFile {
  filename: string
  filePath: string
  content: string
}

export interface DeployResult {
  deployed: string[]
  skipped: string[]
  errors: Array<{ file: string; error: string }>
}

export async function scanPosts(postsDir: string): Promise<PostFile[]> {
  if (!existsSync(postsDir)) return []
  const entries = await readdir(postsDir, { withFileTypes: true })
  const posts: PostFile[] = []
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.md')) continue
    const filePath = join(postsDir, e.name)
    const content = await readFile(filePath, 'utf8')
    posts.push({ filename: e.name, filePath, content })
  }
  return posts.sort((a, b) => a.filename.localeCompare(b.filename))
}

async function findFileInVault(vaultPath: string, filename: string): Promise<string | null> {
  async function recurse(dir: string): Promise<string | null> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return null
    }
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isFile() && e.name === filename) return full
      if (e.isDirectory() && !e.name.startsWith('.')) {
        const found = await recurse(full)
        if (found) return found
      }
    }
    return null
  }
  return recurse(vaultPath)
}

const IMAGE_EMBED_RE = /!\[\[([^\]]+)]]/g

export async function resolveImageLinks(
  content: string,
  vaultPath: string,
  assetsDestDir: string,
  dryRun: boolean,
): Promise<string> {
  const embeds = [...content.matchAll(IMAGE_EMBED_RE)].map((m) => ({
    full: m[0],
    ref: m[1] as string,
  }))

  if (embeds.length === 0) return content

  if (!dryRun) await mkdir(assetsDestDir, { recursive: true })

  let result = content
  for (const { full, ref } of embeds) {
    const filename = basename(ref)
    const sourcePath = await findFileInVault(vaultPath, filename)
    if (!sourcePath) continue

    const destPath = join(assetsDestDir, filename)
    if (!dryRun) {
      try {
        await copyFile(sourcePath, destPath)
      } catch {
        continue
      }
    }

    result = result.replace(full, `![](../assets/${filename})`)
  }
  return result
}

function normalizeFrontmatter(
  data: Record<string, unknown>,
  fileStat: { mtime: Date },
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data }
  if (!out['date']) {
    out['date'] = fileStat.mtime.toISOString().slice(0, 10)
  }
  return out
}

export async function deployPosts(
  vaultPath: string,
  opts: { blogDir?: string; dryRun?: boolean } = {},
): Promise<DeployResult> {
  const blogDir = opts.blogDir ?? join(homedir(), 'Projetos', 'blog')
  const postsDir = join(vaultPath, '20_Areas', '8_Posts')
  const outPostsDir = join(blogDir, 'posts')
  const assetsDir = join(blogDir, 'assets')

  const result: DeployResult = { deployed: [], skipped: [], errors: [] }

  const posts = await scanPosts(postsDir)
  if (posts.length === 0) return result

  if (!opts.dryRun) {
    await mkdir(outPostsDir, { recursive: true })
    await mkdir(assetsDir, { recursive: true })
  }

  for (const post of posts) {
    try {
      const fileStat = await stat(post.filePath)
      const parsed = matter(post.content)

      const resolvedBody = await resolveImageLinks(
        parsed.content,
        vaultPath,
        assetsDir,
        opts.dryRun ?? false,
      )

      const frontmatter = normalizeFrontmatter(parsed.data, { mtime: fileStat.mtime })
      const output = matter.stringify(resolvedBody, frontmatter)

      if (!opts.dryRun) {
        const outPath = join(outPostsDir, post.filename)
        await writeFile(outPath, output, 'utf8')
      }

      result.deployed.push(post.filename)
    } catch (e) {
      result.errors.push({ file: post.filename, error: String(e) })
    }
  }

  return result
}

export function defaultBlogDir(): string {
  return join(homedir(), 'Projetos', 'blog')
}

export function postsDir(vaultPath: string): string {
  return join(vaultPath, '20_Areas', '8_Posts')
}
