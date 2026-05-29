import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { deriveTaskId, addTask } from '../src/vault/task-scaffold.js'
import { scaffoldProject } from '../src/vault/project-scaffold.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = join(tmpdir(), `taverna-scaffold-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(tmpDir, { recursive: true })
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ── deriveTaskId ────────────────────────────────────────────────────────────────

describe('deriveTaskId', () => {
  it('lowercases and replaces spaces with underscores', () => {
    expect(deriveTaskId('Aula de Física')).toBe('aula_de_fisica')
  })

  it('strips Portuguese diacritics', () => {
    expect(deriveTaskId('Prova de Álgebra Linear')).toBe('prova_de_algebra_linear')
    expect(deriveTaskId('Entrega EP3 — Controle')).toBe('entrega_ep3_controle')
    expect(deriveTaskId('Revisão de conteúdo')).toBe('revisao_de_conteudo')
  })

  it('truncates to 40 chars', () => {
    const long = 'aula sobre circuitos integrados e sistemas embarcados modernos'
    expect(deriveTaskId(long).length).toBeLessThanOrEqual(40)
  })

  it('does not end with underscore after truncation', () => {
    const id = deriveTaskId('aula_sobre_um_topico_bem_longo_que_extrapola_limite')
    expect(id).not.toMatch(/[_-]$/)
  })

  it('collapses multiple underscores', () => {
    expect(deriveTaskId('P1   Prova')).toBe('p1_prova')
  })

  it('strips unsupported special chars', () => {
    expect(deriveTaskId('Lab #3: Osciloscópio')).toBe('lab_3_osciloscopio')
  })

  it('returns "task" as fallback for degenerate input', () => {
    expect(deriveTaskId('!!!')).toBe('task')
    expect(deriveTaskId('   ')).toBe('task')
  })
})

// ── addTask ─────────────────────────────────────────────────────────────────────

describe('addTask', () => {
  it('creates tasks/dir and .md with correct frontmatter', async () => {
    const result = await addTask(tmpDir, 'PSI3451', {
      type: 'USP-aula',
      topic: 'Aula 5 — Fibras Ópticas',
      prioridade: 'alta',
    })

    expect(result.created).toBe(true)
    expect(result.id).toBe('aula_5_fibras_opticas')
    expect(existsSync(result.filePath)).toBe(true)

    const content = readFileSync(result.filePath, 'utf8')
    expect(content).toContain('type: USP-aula')
    expect(content).toContain('parent: PSI3451')
    expect(content).toContain('prioridade: alta')
    expect(content).toContain('progresso: 0')
    expect(content).toContain('# Aula 5 — Fibras Ópticas')
  })

  it('includes deadline for USP-entrega', async () => {
    const result = await addTask(tmpDir, 'PSI3451', {
      type: 'USP-entrega',
      topic: 'Entrega EP3',
      prioridade: 'alta',
      deadline: '2026-06-15',
    })

    const content = readFileSync(result.filePath, 'utf8')
    expect(content).toContain('type: USP-entrega')
    expect(content).toContain('deadline: 2026-06-15')
  })

  it('includes optional fields when provided', async () => {
    const result = await addTask(tmpDir, 'PSI3451', {
      type: 'USP-aula',
      topic: 'Lab 2',
      prioridade: 'média',
      assetFolder: '02_Lab',
      workspace: '/tmp/taverna-workspace/',
      dependsOn: ['lab_1'],
    })

    const content = readFileSync(result.filePath, 'utf8')
    expect(content).toContain('asset_folder: 02_Lab')
    expect(content).toContain('workspace: /tmp/taverna-workspace/')
    expect(content).toContain('depends_on:')
    expect(content).toContain('  - lab_1')
  })

  it('is idempotent — returns already_exists without overwriting', async () => {
    const input = { type: 'USP-aula' as const, topic: 'Aula 1', prioridade: 'alta' as const }
    const first = await addTask(tmpDir, 'PSI3451', input)
    expect(first.created).toBe(true)

    const second = await addTask(tmpDir, 'PSI3451', input)
    expect(second.created).toBe(false)
    expect(second.reason).toBe('already_exists')
    expect(second.id).toBe(first.id)
    expect(second.filePath).toBe(first.filePath)
  })

  it('creates tasks/ directory if it does not exist', async () => {
    const projectDir = join(tmpDir, 'NEW_PROJECT')
    await addTask(projectDir, 'NEW_PROJECT', {
      type: 'USP-aula',
      topic: 'Primeira Aula',
      prioridade: 'baixa',
    })
    expect(existsSync(join(projectDir, 'tasks'))).toBe(true)
  })

  it('generic task gets numeric prefix and correct frontmatter', async () => {
    const result = await addTask(tmpDir, 'taverna', {
      type: 'generic',
      topic: 'Add feature X',
      prioridade: 'alta',
    })

    expect(result.created).toBe(true)
    expect(result.id).toMatch(/^1-/)
    const content = readFileSync(result.filePath, 'utf8')
    expect(content).toContain('progresso: 0')
    expect(content).toContain('prioridade: alta')
    expect(content).not.toContain('type:')
    expect(content).not.toContain('parent:')
    expect(content).toContain('# Add feature X')
    expect(content).toContain('## Critérios de conclusão')
  })

  it('generic task increments number based on existing tasks', async () => {
    const tasksDir = join(tmpDir, 'tasks')
    await import('node:fs/promises').then((m) => m.mkdir(tasksDir, { recursive: true }))
    await import('node:fs/promises').then((m) =>
      m.writeFile(join(tasksDir, '5-existing.md'), '# x'),
    )

    const result = await addTask(tmpDir, 'proj', {
      type: 'generic',
      topic: 'New task',
      prioridade: 'baixa',
    })

    expect(result.id).toMatch(/^6-/)
  })

  it('generic task includes optional body and depende', async () => {
    const result = await addTask(tmpDir, 'proj', {
      type: 'generic',
      topic: 'My task',
      prioridade: 'média',
      body: 'Some description here.',
      depende: ['1-other-task'],
      deadline: '2026-07-01',
    })

    const content = readFileSync(result.filePath, 'utf8')
    expect(content).toContain('depende:')
    expect(content).toContain("- '[[1-other-task]]'")
    expect(content).toContain('deadline: 2026-07-01')
    expect(content).toContain('Some description here.')
  })
})

// ── scaffoldProject ─────────────────────────────────────────────────────────────

describe('scaffoldProject', () => {
  it('creates full project structure', async () => {
    const result = await scaffoldProject(tmpDir, {
      id: 'PSI3471',
      name: 'Circuitos Elétricos',
      tipo: 'USP',
    })

    expect(result.created).toBe(true)
    expect(result.id).toBe('PSI3471')

    const root = join(tmpDir, 'PSI3471')
    expect(existsSync(join(root, 'PSI3471.md'))).toBe(true)
    expect(existsSync(join(root, 'Logbook.md'))).toBe(true)
    expect(existsSync(join(root, 'Progresso.md'))).toBe(true)
    expect(existsSync(join(root, 'Material.md'))).toBe(true)
    expect(existsSync(join(root, 'tasks', 'README.md'))).toBe(true)
    expect(existsSync(join(root, 'tasks', 'archive'))).toBe(true)
    expect(existsSync(join(root, 'assets'))).toBe(true)
    expect(existsSync(join(root, 'entregas'))).toBe(true)
  })

  it('writes correct frontmatter in project .md', async () => {
    await scaffoldProject(tmpDir, {
      id: 'PSI3471',
      name: 'Circuitos Elétricos',
      tipo: 'USP',
      priority: 'high',
      edisciplinas: 'https://edisciplinas.usp.br/course/view.php?id=99999',
    })

    const content = readFileSync(join(tmpDir, 'PSI3471', 'PSI3471.md'), 'utf8')
    expect(content).toContain('id: PSI3471')
    expect(content).toContain('tipo: USP')
    expect(content).toContain('priority: high')
    expect(content).toContain("agent: '@study-assistant'")
    expect(content).toContain('edisciplinas:')
    expect(content).toContain('# Circuitos Elétricos')
  })

  it('defaults agent to @dev-agent for tipo *', async () => {
    await scaffoldProject(tmpDir, { id: 'myproject', name: 'My Project', tipo: '*' })
    const content = readFileSync(join(tmpDir, 'myproject', 'myproject.md'), 'utf8')
    expect(content).toContain("agent: '@dev-agent'")
  })

  it('includes horarios and contatos when provided', async () => {
    await scaffoldProject(tmpDir, {
      id: 'PSI3471',
      name: 'Circuitos',
      tipo: 'USP',
      horarios: [{ dia: 'segunda', hora: '8h00', local: 'Sala A1' }],
      contatos: ['[[Prof. Silva]]'],
    })

    const content = readFileSync(join(tmpDir, 'PSI3471', 'PSI3471.md'), 'utf8')
    expect(content).toContain('horarios:')
    expect(content).toContain('dia: segunda')
    expect(content).toContain('hora: 8h00')
    expect(content).toContain("local: 'Sala A1'")
    expect(content).toContain('contatos:')
    expect(content).toContain("  - '[[Prof. Silva]]'")
  })

  it('Progresso.md references project ID', async () => {
    await scaffoldProject(tmpDir, { id: 'PSI3471', name: 'Circuitos', tipo: 'USP' })
    const content = readFileSync(join(tmpDir, 'PSI3471', 'Progresso.md'), 'utf8')
    expect(content).toContain('10_Projects/PSI3471/tasks')
  })

  it('Material.md references project assets folder', async () => {
    await scaffoldProject(tmpDir, { id: 'PSI3471', name: 'Circuitos', tipo: 'USP' })
    const content = readFileSync(join(tmpDir, 'PSI3471', 'Material.md'), 'utf8')
    expect(content).toContain('10_Projects/PSI3471/assets')
  })

  it('is idempotent — returns already_exists without overwriting', async () => {
    const input = { id: 'PSI3471', name: 'Circuitos', tipo: 'USP' as const }
    const first = await scaffoldProject(tmpDir, input)
    expect(first.created).toBe(true)

    const second = await scaffoldProject(tmpDir, input)
    expect(second.created).toBe(false)
    expect(second.reason).toBe('already_exists')
  })
})
