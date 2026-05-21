import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFile, rm, mkdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import matter from 'gray-matter'
import { updateCompletedTaskSessionId } from '../src/vault/update.js'

let tmp: string

beforeEach(async () => {
  tmp = join(tmpdir(), `taverna-vault-update-test-${Date.now()}`)
  await mkdir(tmp, { recursive: true })
  await mkdir(join(tmp, 'archive'), { recursive: true })
})

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true })
})

async function writeTask(name: string, progresso: number, dir = tmp): Promise<string> {
  const path = join(dir, name)
  await writeFile(path, `---\nprogresso: ${progresso}\n---\n# Task\n`, 'utf8')
  return path
}

async function readSessionId(path: string): Promise<string | undefined> {
  const raw = await readFile(path, 'utf8')
  const { data } = matter(raw)
  return typeof data['_session_id'] === 'string' ? data['_session_id'] : undefined
}

describe('updateCompletedTaskSessionId', () => {
  it('stamps _session_id on a task that reached progresso 100', async () => {
    const path = await writeTask('task-a.md', 100)
    await updateCompletedTaskSessionId([path], 'test-uuid-1')
    expect(await readSessionId(path)).toBe('test-uuid-1')
  })

  it('does not stamp tasks still in progress', async () => {
    const path = await writeTask('task-b.md', 50)
    await updateCompletedTaskSessionId([path], 'test-uuid-2')
    expect(await readSessionId(path)).toBeUndefined()
  })

  it('does not stamp tasks at progresso 0', async () => {
    const path = await writeTask('task-c.md', 0)
    await updateCompletedTaskSessionId([path], 'test-uuid-3')
    expect(await readSessionId(path)).toBeUndefined()
  })

  it('stamps task found in archive path when original is gone', async () => {
    const originalPath = join(tmp, 'task-d.md')
    const archivePath = await writeTask('task-d.md', 100, join(tmp, 'archive'))
    await updateCompletedTaskSessionId([originalPath], 'test-uuid-4')
    expect(await readSessionId(archivePath)).toBe('test-uuid-4')
  })

  it('handles empty list without error', async () => {
    await expect(updateCompletedTaskSessionId([], 'test-uuid-5')).resolves.toBeUndefined()
  })

  it('handles multiple tasks, stamps only completed ones', async () => {
    const done = await writeTask('task-e.md', 100)
    const pending = await writeTask('task-f.md', 30)
    await updateCompletedTaskSessionId([done, pending], 'test-uuid-6')
    expect(await readSessionId(done)).toBe('test-uuid-6')
    expect(await readSessionId(pending)).toBeUndefined()
  })
})
