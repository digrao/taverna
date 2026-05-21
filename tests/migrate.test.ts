import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { scanArchive } from '../src/migrate/scan.js'
import { buildMigratePrompt } from '../src/migrate/prompt.js'
import { promote } from '../src/migrate/promote.js'
import type { MigrationDraft } from '../src/migrate/types.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = join(tmpdir(), `taverna-migrate-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(tmpDir, { recursive: true })
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ── scanArchive ───────────────────────────────────────────────────────────────

describe('scanArchive', () => {
  it('reads all .md files from a folder', async () => {
    writeFileSync(join(tmpDir, 'note1.md'), '---\nrelevancia: 3\n---\nConteúdo da note 1')
    writeFileSync(join(tmpDir, 'note2.md'), 'Sem frontmatter')
    writeFileSync(join(tmpDir, 'image.png'), 'binary')

    const notes = await scanArchive(tmpDir)
    expect(notes).toHaveLength(2)
    expect(notes.map(n => n.filename).sort()).toEqual(['note1.md', 'note2.md'])
  })

  it('parses frontmatter from notes', async () => {
    writeFileSync(join(tmpDir, 'a.md'), '---\nid: abc\n---\nCorpo do texto')

    const notes = await scanArchive(tmpDir)
    expect(notes[0]?.frontmatter['id']).toBe('abc')
    expect(notes[0]?.body).toBe('Corpo do texto')
  })

  it('reads a single .md file directly', async () => {
    const filePath = join(tmpDir, 'solo.md')
    writeFileSync(filePath, '# Solo note\nConteúdo')

    const notes = await scanArchive(filePath)
    expect(notes).toHaveLength(1)
    expect(notes[0]?.filename).toBe('solo.md')
  })

  it('throws if path does not exist', async () => {
    await expect(scanArchive('/nonexistent/path')).rejects.toThrow('not found')
  })

  it('returns empty array for folder with no .md files', async () => {
    writeFileSync(join(tmpDir, 'doc.pdf'), 'pdf content')
    const notes = await scanArchive(tmpDir)
    expect(notes).toHaveLength(0)
  })
})

// ── buildMigratePrompt ────────────────────────────────────────────────────────

describe('buildMigratePrompt', () => {
  it('includes all note filenames in the prompt', () => {
    const notes = [
      { filename: 'main.md', body: 'Projeto X', frontmatter: {} },
      { filename: 'idea.md', body: 'Uma ideia', frontmatter: { relevancia: 4 } },
    ]
    const prompt = buildMigratePrompt(notes, 'projeto-x')
    expect(prompt).toContain('main.md')
    expect(prompt).toContain('idea.md')
    expect(prompt).toContain('projeto-x')
  })

  it('includes frontmatter fields in the prompt', () => {
    const notes = [{ filename: 'a.md', body: 'body', frontmatter: { id: 'foo', relevancia: 5 } }]
    const prompt = buildMigratePrompt(notes, 'foo')
    expect(prompt).toContain('"id"')
    expect(prompt).toContain('"foo"')
  })

  it('requests JSON output with required fields', () => {
    const notes = [{ filename: 'x.md', body: 'content', frontmatter: {} }]
    const prompt = buildMigratePrompt(notes, 'x')
    expect(prompt).toContain('```json')
    expect(prompt).toContain('"id"')
    expect(prompt).toContain('"tipo"')
    expect(prompt).toContain('"priority"')
    expect(prompt).toContain('"tasks"')
  })
})

// ── promote ───────────────────────────────────────────────────────────────────

describe('promote', () => {
  const draft: MigrationDraft = {
    id: 'meu-projeto',
    tipo: '*',
    priority: 'high',
    run_every: 'weekly',
    body: '# Meu Projeto\n\nDescrição do projeto.',
    tasks: [
      { id: 'setup', title: 'Setup inicial', prioridade: 'high', progresso: 0, body: 'Configurar o ambiente' },
      { id: 'docs', title: 'Escrever docs', prioridade: 'low', progresso: 0, body: 'Documentar tudo' },
    ],
  }

  it('creates project folder, main file, and task files', async () => {
    await promote(draft, tmpDir)

    const projectFile = join(tmpDir, 'meu-projeto', 'meu-projeto.md')
    const taskSetup = join(tmpDir, 'meu-projeto', 'tasks', 'setup.md')
    const taskDocs = join(tmpDir, 'meu-projeto', 'tasks', 'docs.md')

    expect(existsSync(projectFile)).toBe(true)
    expect(existsSync(taskSetup)).toBe(true)
    expect(existsSync(taskDocs)).toBe(true)
  })

  it('project file contains correct frontmatter', async () => {
    await promote(draft, tmpDir)
    const content = readFileSync(join(tmpDir, 'meu-projeto', 'meu-projeto.md'), 'utf8')
    expect(content).toContain("id: meu-projeto")
    expect(content).toContain("tipo: '*'")
    expect(content).toContain('priority: high')
    expect(content).toContain('run_every: weekly')
  })

  it('task file contains frontmatter and heading', async () => {
    await promote(draft, tmpDir)
    const content = readFileSync(join(tmpDir, 'meu-projeto', 'tasks', 'setup.md'), 'utf8')
    expect(content).toContain('prioridade: high')
    expect(content).toContain('progresso: 0')
    expect(content).toContain('# Setup inicial')
    expect(content).toContain('Configurar o ambiente')
  })

  it('noTasks skips task creation', async () => {
    await promote(draft, tmpDir, { noTasks: true })
    const tasksDir = join(tmpDir, 'meu-projeto', 'tasks')
    expect(existsSync(tasksDir)).toBe(false)
  })

  it('dry-run returns paths without writing', async () => {
    const result = await promote(draft, tmpDir, { dryRun: true })
    expect(result.projectPath).toContain('meu-projeto.md')
    expect(result.tasksCreated).toHaveLength(2)
    // nothing was created
    expect(existsSync(join(tmpDir, 'meu-projeto'))).toBe(false)
  })

  it('throws if project folder already exists', async () => {
    mkdirSync(join(tmpDir, 'meu-projeto'), { recursive: true })
    await expect(promote(draft, tmpDir)).rejects.toThrow('already exists')
  })

  it('returns correct result metadata', async () => {
    const result = await promote(draft, tmpDir)
    expect(result.projectPath).toContain('meu-projeto/meu-projeto.md')
    expect(result.tasksCreated).toHaveLength(2)
  })
})
