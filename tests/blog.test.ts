import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { scanPosts, resolveImageLinks, deployPosts } from '../src/blog/index.js'

let tmp: string
let vaultPath: string
let blogDir: string
let postsDir: string

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'taverna-blog-'))
  vaultPath = join(tmp, 'vault')
  blogDir = join(tmp, 'blog')
  postsDir = join(vaultPath, '20_Areas', '8_Posts')
  await mkdir(postsDir, { recursive: true })
})

async function cleanup() {
  await rm(tmp, { recursive: true, force: true })
}

describe('scanPosts', () => {
  it('returns empty array when directory does not exist', async () => {
    const result = await scanPosts(join(tmp, 'nonexistent'))
    expect(result).toEqual([])
    await cleanup()
  })

  it('returns .md files sorted by name', async () => {
    await writeFile(join(postsDir, 'b-post.md'), '# B')
    await writeFile(join(postsDir, 'a-post.md'), '# A')
    await writeFile(join(postsDir, 'not-md.txt'), 'skip')

    const result = await scanPosts(postsDir)
    expect(result.map((p) => p.filename)).toEqual(['a-post.md', 'b-post.md'])
    await cleanup()
  })
})

describe('resolveImageLinks', () => {
  it('replaces ![[image]] with standard markdown link and copies file', async () => {
    const imgDir = join(vaultPath, 'attachments')
    await mkdir(imgDir, { recursive: true })
    await writeFile(join(imgDir, 'photo.png'), Buffer.from('fake-png'))

    const assetsDir = join(blogDir, 'assets')
    const result = await resolveImageLinks('![[photo.png]]', vaultPath, assetsDir, false)

    expect(result).toBe('![](../assets/photo.png)')
    const copied = await import('node:fs/promises').then((m) =>
      m.readFile(join(assetsDir, 'photo.png')),
    )
    expect(copied.toString()).toBe('fake-png')
    await cleanup()
  })

  it('leaves embed unchanged when image not found in vault', async () => {
    const assetsDir = join(blogDir, 'assets')
    const result = await resolveImageLinks('![[missing.png]]', vaultPath, assetsDir, true)
    expect(result).toBe('![[missing.png]]')
    await cleanup()
  })

  it('does not copy files in dry-run mode', async () => {
    const imgDir = join(vaultPath, 'img')
    await mkdir(imgDir, { recursive: true })
    await writeFile(join(imgDir, 'shot.jpg'), Buffer.from('data'))

    const assetsDir = join(blogDir, 'assets')
    const result = await resolveImageLinks('![[shot.jpg]]', vaultPath, assetsDir, true)

    expect(result).toBe('![](../assets/shot.jpg)')
    const { existsSync } = await import('node:fs')
    expect(existsSync(assetsDir)).toBe(false)
    await cleanup()
  })

  it('handles multiple embeds in one file', async () => {
    const imgDir = join(vaultPath, 'img')
    await mkdir(imgDir, { recursive: true })
    await writeFile(join(imgDir, 'a.png'), Buffer.from('a'))
    await writeFile(join(imgDir, 'b.png'), Buffer.from('b'))

    const assetsDir = join(blogDir, 'assets')
    const content = 'See ![[a.png]] and ![[b.png]] here.'
    const result = await resolveImageLinks(content, vaultPath, assetsDir, true)

    expect(result).toBe('See ![](../assets/a.png) and ![](../assets/b.png) here.')
    await cleanup()
  })
})

describe('deployPosts', () => {
  it('deploys posts to blogDir/posts/ and adds date if missing', async () => {
    await writeFile(join(postsDir, 'hello.md'), '---\ntitle: Hello\n---\n\nContent here.')

    const result = await deployPosts(vaultPath, { blogDir })

    expect(result.deployed).toEqual(['hello.md'])
    expect(result.errors).toEqual([])

    const { readFile } = await import('node:fs/promises')
    const written = await readFile(join(blogDir, 'posts', 'hello.md'), 'utf8')
    expect(written).toContain('title: Hello')
    expect(written).toMatch(/date:/)
    expect(written).toContain('Content here.')
    await cleanup()
  })

  it('preserves existing date frontmatter', async () => {
    await writeFile(
      join(postsDir, 'dated.md'),
      '---\ntitle: Dated\ndate: 2024-01-15\n---\n\nHello.',
    )

    await deployPosts(vaultPath, { blogDir })

    const { readFile } = await import('node:fs/promises')
    const written = await readFile(join(blogDir, 'posts', 'dated.md'), 'utf8')
    expect(written).toContain('date: 2024-01-15')
    await cleanup()
  })

  it('dry-run does not write files', async () => {
    await writeFile(join(postsDir, 'test.md'), '# Test')

    const result = await deployPosts(vaultPath, { blogDir, dryRun: true })

    expect(result.deployed).toEqual(['test.md'])
    const { existsSync } = await import('node:fs')
    expect(existsSync(join(blogDir, 'posts', 'test.md'))).toBe(false)
    await cleanup()
  })

  it('returns empty result when posts dir does not exist', async () => {
    const emptyVault = join(tmp, 'empty-vault')
    await mkdir(emptyVault, { recursive: true })

    const result = await deployPosts(emptyVault, { blogDir })
    expect(result.deployed).toEqual([])
    expect(result.errors).toEqual([])
    await cleanup()
  })
})
