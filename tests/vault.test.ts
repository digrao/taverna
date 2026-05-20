import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  parseFrontmatter,
  getPriority,
  getRunEvery,
  getProgress,
  getString,
} from '../src/vault/frontmatter.js'

import { progressToState, readProjectTasks } from '../src/vault/task.js'
import { detectProjectType, readProject, scanProjects } from '../src/vault/project.js'
import { discoverAgents, readAgent } from '../src/vault/agent.js'
import { readLogbook, appendLogbook } from '../src/vault/logbook.js'
import {
  sortByPriority,
  filterByAgent,
  getPendingTasks,
} from '../src/vault/index.js'
import type { VaultProject, Priority } from '../src/vault/types.js'
import { defineConfig } from '../src/config.js'

// ── Test fixture helpers ──────────────────────────────────────────────────────

let tmpDir: string

beforeEach(() => {
  tmpDir = join(tmpdir(), `taverna-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(tmpDir, { recursive: true })
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function write(relPath: string, content: string) {
  const fullPath = join(tmpDir, relPath)
  mkdirSync(join(fullPath, '..'), { recursive: true })
  writeFileSync(fullPath, content, 'utf8')
  return fullPath
}

// ── Group A: frontmatter parsing ──────────────────────────────────────────────

describe('parseFrontmatter', () => {
  it('extracts standard YAML fields', () => {
    const { data } = parseFrontmatter('---\nid: PSI3451\npriority: high\n---\ncontent')
    expect(data['id']).toBe('PSI3451')
    expect(data['priority']).toBe('high')
  })

  it('handles Obsidian WikiLink values without throwing', () => {
    const raw = "---\ncontatos:\n  - '[[Bruno Sanches|Prof. Bruno]]'\n---\n"
    expect(() => parseFrontmatter(raw)).not.toThrow()
    const { data } = parseFrontmatter(raw)
    expect(Array.isArray(data['contatos'])).toBe(true)
  })

  it('returns body content after frontmatter', () => {
    const { content } = parseFrontmatter('---\nid: foo\n---\nhello world')
    expect(content.trim()).toBe('hello world')
  })

  it('handles file with no frontmatter', () => {
    const { data, content } = parseFrontmatter('# Just a title\nsome text')
    expect(Object.keys(data)).toHaveLength(0)
    expect(content).toContain('Just a title')
  })
})

describe('getPriority', () => {
  it('normalizes English high/medium/low', () => {
    expect(getPriority({ priority: 'high' })).toBe('high')
    expect(getPriority({ priority: 'medium' })).toBe('medium')
    expect(getPriority({ priority: 'low' })).toBe('low')
  })

  it('normalizes Portuguese alta/média/baixa', () => {
    expect(getPriority({ prioridade: 'alta' })).toBe('high')
    expect(getPriority({ prioridade: 'média' })).toBe('medium')
    expect(getPriority({ prioridade: 'baixa' })).toBe('low')
  })

  it('returns medium as default when absent', () => {
    expect(getPriority({})).toBe('medium')
  })

  it('is case-insensitive', () => {
    expect(getPriority({ priority: 'HIGH' })).toBe('high')
    expect(getPriority({ prioridade: 'ALTA' })).toBe('high')
  })
})

describe('getRunEvery', () => {
  it('normalizes all valid values', () => {
    expect(getRunEvery({ run_every: 'daily' })).toBe('daily')
    expect(getRunEvery({ run_every: 'hourly' })).toBe('hourly')
    expect(getRunEvery({ run_every: 'weekly' })).toBe('weekly')
    expect(getRunEvery({ run_every: 'monthly' })).toBe('monthly')
  })

  it('defaults to never when absent', () => {
    expect(getRunEvery({})).toBe('never')
    expect(getRunEvery({ run_every: 'bogus' })).toBe('never')
  })
})

describe('getProgress', () => {
  it('converts percentage string to number', () => {
    expect(getProgress({ progresso: '75%' })).toBe(75)
    expect(getProgress({ progresso: '100%' })).toBe(100)
    expect(getProgress({ progresso: '0%' })).toBe(0)
  })

  it('accepts numeric value directly', () => {
    expect(getProgress({ progress: 50 })).toBe(50)
    expect(getProgress({ progresso: 30 })).toBe(30)
  })

  it('falls back to progress when progresso absent', () => {
    expect(getProgress({ progress: 25 })).toBe(25)
  })

  it('returns 0 when absent', () => {
    expect(getProgress({})).toBe(0)
  })

  it('clamps to 0-100', () => {
    expect(getProgress({ progresso: 150 })).toBe(100)
    expect(getProgress({ progresso: -10 })).toBe(0)
  })
})

// ── Group B: project type detection ──────────────────────────────────────────

describe('detectProjectType', () => {
  const prefixes = ['PSI', 'PEA', 'PEF']

  it('detects USP from PSI folder prefix', () => {
    expect(detectProjectType('PSI3451', {}, prefixes)).toBe('USP')
  })

  it('detects USP from PEA folder prefix', () => {
    expect(detectProjectType('PEA3100', {}, prefixes)).toBe('USP')
  })

  it('detects USP from PEF folder prefix', () => {
    expect(detectProjectType('PEF3208', {}, prefixes)).toBe('USP')
  })

  it('detects BB from type: work', () => {
    expect(detectProjectType('myproject', { type: 'work' }, prefixes)).toBe('BB')
  })

  it('BB wins over USP folder prefix when type: work', () => {
    expect(detectProjectType('PSI9999', { type: 'work' }, prefixes)).toBe('BB')
  })

  it('detects BB from cardId presence', () => {
    expect(detectProjectType('myproject', { cardId: '123' }, prefixes)).toBe('BB')
  })

  it('type: study with non-USP folder → USP', () => {
    expect(detectProjectType('calculus', { type: 'study' }, prefixes)).toBe('USP')
  })

  it('type: personal → *', () => {
    expect(detectProjectType('my-notes', { type: 'personal' }, prefixes)).toBe('*')
  })

  it('type: dev → *', () => {
    expect(detectProjectType('taverna', { type: 'dev' }, prefixes)).toBe('*')
  })

  it('no type, no USP prefix, no cardId → *', () => {
    expect(detectProjectType('random', {}, prefixes)).toBe('*')
  })
})

// ── Group C: task parsing ─────────────────────────────────────────────────────

describe('progressToState', () => {
  it('0 → tarefinha', () => expect(progressToState(0)).toBe('tarefinha'))
  it('1 → tarefa', () => expect(progressToState(1)).toBe('tarefa'))
  it('49 → tarefa', () => expect(progressToState(49)).toBe('tarefa'))
  it('50 → em-progresso', () => expect(progressToState(50)).toBe('em-progresso'))
  it('99 → em-progresso', () => expect(progressToState(99)).toBe('em-progresso'))
  it('100 → concluida', () => expect(progressToState(100)).toBe('concluida'))
})

describe('readProjectTasks', () => {
  it('returns empty array when no tasks/ folder', async () => {
    const tasks = await readProjectTasks(tmpDir)
    expect(tasks).toEqual([])
  })

  it('parses frontmatter fields from task file', async () => {
    write('tasks/t1.md', '---\nprogresso: 50%\nprioridade: alta\ndeadline: 2026-06-01\nasset_folder: ../assets/1_Aula\n---\n# My Task\nbody text')
    const tasks = await readProjectTasks(tmpDir)
    expect(tasks).toHaveLength(1)
    const t = tasks[0]!
    expect(t.progresso).toBe(50)
    expect(t.prioridade).toBe('high')
    expect(t.deadline).toBe('2026-06-01')
    expect(t.assetFolder).toBe('../assets/1_Aula')
    expect(t.state).toBe('em-progresso')
  })

  it('uses heading as task title', async () => {
    write('tasks/t1.md', '---\nprogresso: 0%\n---\n# Aula 2 — Full Adder\nbody')
    const tasks = await readProjectTasks(tmpDir)
    expect(tasks[0]!.title).toBe('Aula 2 — Full Adder')
  })

  it('falls back to file stem as title when no heading', async () => {
    write('tasks/my-task.md', '---\nprogresso: 0%\n---\nno heading here')
    const tasks = await readProjectTasks(tmpDir)
    expect(tasks[0]!.title).toBe('my-task')
  })

  it('skips README.md in tasks/', async () => {
    write('tasks/README.md', '# This is a readme, not a task')
    write('tasks/real.md', '---\nprogresso: 0%\n---\n# Real Task')
    const tasks = await readProjectTasks(tmpDir)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]!.id).toBe('real')
  })

  it('uses progress field when progresso absent', async () => {
    write('tasks/t1.md', '---\nprogress: 75\n---\n# Task')
    const tasks = await readProjectTasks(tmpDir)
    expect(tasks[0]!.progresso).toBe(75)
    expect(tasks[0]!.state).toBe('em-progresso')
  })

  it('defaults prioridade to medium when absent', async () => {
    write('tasks/t1.md', '---\nprogresso: 0%\n---\n# Task')
    const tasks = await readProjectTasks(tmpDir)
    expect(tasks[0]!.prioridade).toBe('medium')
  })

  it('sorts tasks by prioridade: high before medium before low', async () => {
    write('tasks/low.md', '---\nprioridade: baixa\n---\n# Low')
    write('tasks/high.md', '---\nprioridade: alta\n---\n# High')
    write('tasks/med.md', '---\nprioridade: média\n---\n# Med')
    const tasks = await readProjectTasks(tmpDir)
    expect(tasks.map(t => t.prioridade)).toEqual(['high', 'medium', 'low'])
  })
})

// ── Group D: project scanning ─────────────────────────────────────────────────

describe('scanProjects', () => {
  it('finds loose .md files in projects dir', async () => {
    write('10_Projects/MyProject.md', '---\nid: MyProject\ntype: personal\n---\n# My Project')
    const projects = await scanProjects(join(tmpDir, '10_Projects'), ['PSI', 'PEA', 'PEF'])
    expect(projects.some(p => p.id === 'MyProject')).toBe(true)
  })

  it('finds folder projects (folder/Folder.md pattern)', async () => {
    write('10_Projects/PSI3451/PSI3451.md', '---\nid: PSI3451\ntype: study\n---\n# PSI3451')
    const projects = await scanProjects(join(tmpDir, '10_Projects'), ['PSI', 'PEA', 'PEF'])
    expect(projects.some(p => p.id === 'PSI3451')).toBe(true)
  })

  it('ignores folders without matching .md file', async () => {
    mkdirSync(join(tmpDir, '10_Projects', 'EmptyFolder'), { recursive: true })
    const projects = await scanProjects(join(tmpDir, '10_Projects'), ['PSI', 'PEA', 'PEF'])
    expect(projects.some(p => p.name === 'EmptyFolder')).toBe(false)
  })

  it('ignores hidden folders like .obsidian', async () => {
    write('.obsidian/config.json', '{}')
    const projects = await scanProjects(join(tmpDir, '10_Projects'), ['PSI', 'PEA', 'PEF'])
    expect(projects.some(p => p.name === '.obsidian')).toBe(false)
  })

  it('sets hasTasksFolder true when tasks/ exists', async () => {
    write('10_Projects/PSI3451/PSI3451.md', '---\nid: PSI3451\n---\n# PSI3451')
    write('10_Projects/PSI3451/tasks/1.md', '---\nprogresso: 0%\n---\n# Task')
    const projects = await scanProjects(join(tmpDir, '10_Projects'), ['PSI', 'PEA', 'PEF'])
    const p = projects.find(p => p.id === 'PSI3451')!
    expect(p.hasTasksFolder).toBe(true)
  })

  it('sets hasAssetsFolder true when assets/ exists', async () => {
    write('10_Projects/PSI3451/PSI3451.md', '---\nid: PSI3451\n---\n# PSI3451')
    mkdirSync(join(tmpDir, '10_Projects', 'PSI3451', 'assets'), { recursive: true })
    const projects = await scanProjects(join(tmpDir, '10_Projects'), ['PSI', 'PEA', 'PEF'])
    const p = projects.find(p => p.id === 'PSI3451')!
    expect(p.hasAssetsFolder).toBe(true)
  })

  it('returns tasks: [] when tasks/ folder does not exist', async () => {
    write('10_Projects/PSI3451/PSI3451.md', '---\nid: PSI3451\n---\n# PSI3451')
    const projects = await scanProjects(join(tmpDir, '10_Projects'), ['PSI', 'PEA', 'PEF'])
    const p = projects.find(p => p.id === 'PSI3451')!
    expect(p.tasks).toEqual([])
    expect(p.hasTasksFolder).toBe(false)
  })

  it('uses id from frontmatter, falls back to folder name', async () => {
    write('10_Projects/MyFolder/MyFolder.md', '---\nid: explicit-id\n---\n# Project')
    write('10_Projects/NoId/NoId.md', '---\n---\n# No ID')
    const projects = await scanProjects(join(tmpDir, '10_Projects'), ['PSI', 'PEA', 'PEF'])
    expect(projects.some(p => p.id === 'explicit-id')).toBe(true)
    expect(projects.some(p => p.id === 'NoId')).toBe(true)
  })

  it('loose .md has folderPath undefined', async () => {
    write('10_Projects/Loose.md', '---\nid: Loose\n---\n# Loose')
    const projects = await scanProjects(join(tmpDir, '10_Projects'), ['PSI', 'PEA', 'PEF'])
    const p = projects.find(p => p.id === 'Loose')!
    expect(p.folderPath).toBeUndefined()
    expect(p.hasTasksFolder).toBe(false)
    expect(p.hasAssetsFolder).toBe(false)
  })

  it('USP project has tipo USP', async () => {
    write('10_Projects/PSI3451/PSI3451.md', '---\nid: PSI3451\n---\n# PSI3451')
    const projects = await scanProjects(join(tmpDir, '10_Projects'), ['PSI', 'PEA', 'PEF'])
    expect(projects.find(p => p.id === 'PSI3451')!.tipo).toBe('USP')
  })

  it('work project has tipo BB', async () => {
    write('10_Projects/Proj.md', '---\nid: BB1\ntype: work\n---\n# BB Project')
    const projects = await scanProjects(join(tmpDir, '10_Projects'), ['PSI', 'PEA', 'PEF'])
    expect(projects.find(p => p.id === 'BB1')!.tipo).toBe('BB')
  })
})

describe('readProject', () => {
  it('parses a full project file', async () => {
    const path = write('proj/PSI3421.md', `---
id: PSI3421
agent: '@study-assistant'
type: study
priority: high
run_every: daily
_last_run: '2026-05-19T14:18:24'
_last_status: success
_runs_total: 5
edisciplinas: https://example.com
---
# PSI3421 content`)
    const project = await readProject(path, ['PSI', 'PEA', 'PEF'])
    expect(project.id).toBe('PSI3421')
    expect(project.tipo).toBe('USP')
    expect(project.agent).toBe('@study-assistant')
    expect(project.priority).toBe('high')
    expect(project.runEvery).toBe('daily')
    expect(project.lastRun).toBe('2026-05-19T14:18:24')
    expect(project.lastStatus).toBe('success')
    expect(project.runsTotal).toBe(5)
    if (project.tipo === 'USP') {
      expect(project.edisciplinas).toBe('https://example.com')
    }
  })
})

// ── Group E: agent discovery ──────────────────────────────────────────────────

describe('discoverAgents', () => {
  it('finds all directives.md entries', async () => {
    write('60_Agents/1_Directives/planner/directives.md',
      '---\nname: "@planner"\nrunner: claude\ndescription: Planeja sprints\n---\nDo planning.')
    write('60_Agents/1_Directives/study-assistant/directives.md',
      '---\nname: "@study-assistant"\nrunner: claude\n---\nStudy help.')
    const agents = await discoverAgents(join(tmpDir, '60_Agents/1_Directives'))
    expect(agents).toHaveLength(2)
    expect(agents.some(a => a.id === '@planner')).toBe(true)
    expect(agents.some(a => a.id === '@study-assistant')).toBe(true)
  })

  it('agent name falls back to @<foldername> when not in frontmatter', async () => {
    write('60_Agents/1_Directives/reviewer/directives.md',
      '---\nrunner: ollama\nmodel: hermes3:8b\n---\nReview code.')
    const agents = await discoverAgents(join(tmpDir, '60_Agents/1_Directives'))
    expect(agents[0]!.id).toBe('@reviewer')
  })

  it('agent runner defaults to claude when not specified', async () => {
    write('60_Agents/1_Directives/myagent/directives.md',
      '---\nname: "@myagent"\n---\nDirectives.')
    const agents = await discoverAgents(join(tmpDir, '60_Agents/1_Directives'))
    expect(agents[0]!.runner.type).toBe('claude')
  })

  it('directive text contains body text not frontmatter', async () => {
    write('60_Agents/1_Directives/a/directives.md',
      '---\nname: "@a"\n---\nThis is the directive body.')
    const agents = await discoverAgents(join(tmpDir, '60_Agents/1_Directives'))
    expect(agents[0]!.directiveText).toContain('directive body')
    expect(agents[0]!.directiveText).not.toContain('name:')
  })

  it('skips folders without directives.md', async () => {
    mkdirSync(join(tmpDir, '60_Agents/1_Directives/empty-folder'), { recursive: true })
    const agents = await discoverAgents(join(tmpDir, '60_Agents/1_Directives'))
    expect(agents).toHaveLength(0)
  })

  it('sets ollama model when specified', async () => {
    write('60_Agents/1_Directives/reviewer/directives.md',
      '---\nname: "@reviewer"\nrunner: ollama\nmodel: hermes3:8b\n---\nReview.')
    const agents = await discoverAgents(join(tmpDir, '60_Agents/1_Directives'))
    const a = agents[0]!
    expect(a.runner.type).toBe('ollama')
    expect(a.runner.model).toBe('hermes3:8b')
  })
})

describe('readAgent', () => {
  it('reads a single agent folder', async () => {
    const folderPath = join(tmpDir, 'agents/planner')
    write('agents/planner/directives.md',
      '---\nname: "@planner"\nrunner: claude\ndescription: Plans sprints\n---\nPlan work.')
    const agent = await readAgent(folderPath)
    expect(agent.id).toBe('@planner')
    expect(agent.description).toBe('Plans sprints')
    expect(agent.directiveText.trim()).toBe('Plan work.')
  })
})

// ── Group F: logbook ──────────────────────────────────────────────────────────

describe('readLogbook', () => {
  it('returns empty array for non-existent logbook', async () => {
    const config = defineConfig({ vaultPath: tmpDir })
    const entries = await readLogbook('@nonexistent', config)
    expect(entries).toEqual([])
  })

  it('parses executor format: ## [ISO_TIMESTAMP] ProjectName', async () => {
    write('60_Agents/2_Logbooks/planner.md', `## [2026-05-19T14:14:05.847151] Alterações do APP Parceiros
**Success:** True
**Duration:** 6.41s

some output here
`)
    const config = defineConfig({ vaultPath: tmpDir })
    const entries = await readLogbook('@planner', config)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.timestamp).toBe('2026-05-19T14:14:05.847151')
    expect(entries[0]!.projectName).toBe('Alterações do APP Parceiros')
    expect(entries[0]!.success).toBe(true)
    expect(entries[0]!.duration).toBeCloseTo(6.41)
  })

  it('parses study-assistant format: ## YYYY-MM-DD HH:MM — ProjectName', async () => {
    write('60_Agents/2_Logbooks/study-assistant.md', `## 2026-05-19 14:17 — PSI3441/Configuração + Atividades
- Modo: C
- Itens fechados: nenhum
`)
    const config = defineConfig({ vaultPath: tmpDir })
    const entries = await readLogbook('@study-assistant', config)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.timestamp).toBe('2026-05-19T14:17:00')
    expect(entries[0]!.projectName).toBe('PSI3441/Configuração + Atividades')
  })

  it('returns entries in chronological order', async () => {
    write('60_Agents/2_Logbooks/planner.md', `## [2026-05-19T10:00:00] First
content

## [2026-05-19T08:00:00] Second
content
`)
    const config = defineConfig({ vaultPath: tmpDir })
    const entries = await readLogbook('@planner', config)
    expect(entries[0]!.timestamp < entries[1]!.timestamp).toBe(true)
  })

  it('handles logbook file with multiple entries', async () => {
    write('60_Agents/2_Logbooks/planner.md', `## [2026-05-19T10:00:00] Proj1
content1

## [2026-05-19T11:00:00] Proj2
content2
`)
    const config = defineConfig({ vaultPath: tmpDir })
    const entries = await readLogbook('@planner', config)
    expect(entries).toHaveLength(2)
  })
})

describe('appendLogbook', () => {
  it('creates file if it does not exist', async () => {
    const config = defineConfig({ vaultPath: tmpDir })
    mkdirSync(join(tmpDir, '60_Agents/2_Logbooks'), { recursive: true })
    await appendLogbook('@newagent', {
      projectName: 'TestProject',
      content: 'Test output',
    }, config)
    const entries = await readLogbook('@newagent', config)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.projectName).toBe('TestProject')
  })

  it('appends without overwriting existing entries', async () => {
    const config = defineConfig({ vaultPath: tmpDir })
    mkdirSync(join(tmpDir, '60_Agents/2_Logbooks'), { recursive: true })
    await appendLogbook('@agent', { projectName: 'Proj1', content: 'out1' }, config)
    await appendLogbook('@agent', { projectName: 'Proj2', content: 'out2' }, config)
    const entries = await readLogbook('@agent', config)
    expect(entries).toHaveLength(2)
  })
})

// ── Group G: query helpers ────────────────────────────────────────────────────

describe('sortByPriority', () => {
  it('orders high → medium → low', () => {
    const projects: VaultProject[] = [
      { id: 'L', tipo: '*', name: 'L', filePath: '', priority: 'low', runEvery: 'never', runsTotal: 0, tasks: [], hasTasksFolder: false, hasAssetsFolder: false, content: '', raw: {} },
      { id: 'H', tipo: '*', name: 'H', filePath: '', priority: 'high', runEvery: 'never', runsTotal: 0, tasks: [], hasTasksFolder: false, hasAssetsFolder: false, content: '', raw: {} },
      { id: 'M', tipo: '*', name: 'M', filePath: '', priority: 'medium', runEvery: 'never', runsTotal: 0, tasks: [], hasTasksFolder: false, hasAssetsFolder: false, content: '', raw: {} },
    ]
    const sorted = sortByPriority(projects)
    expect(sorted.map(p => p.priority)).toEqual(['high', 'medium', 'low'])
  })
})

describe('filterByAgent', () => {
  it('filters correctly by agent string', () => {
    const projects: VaultProject[] = [
      { id: 'A', tipo: '*', name: 'A', filePath: '', priority: 'medium', agent: '@planner', runEvery: 'never', runsTotal: 0, tasks: [], hasTasksFolder: false, hasAssetsFolder: false, content: '', raw: {} },
      { id: 'B', tipo: '*', name: 'B', filePath: '', priority: 'medium', agent: '@study-assistant', runEvery: 'never', runsTotal: 0, tasks: [], hasTasksFolder: false, hasAssetsFolder: false, content: '', raw: {} },
    ]
    const filtered = filterByAgent(projects, '@planner')
    expect(filtered).toHaveLength(1)
    expect(filtered[0]!.id).toBe('A')
  })
})

describe('getPendingTasks', () => {
  it('returns only non-concluida tasks', () => {
    const p: VaultProject = {
      id: 'P', tipo: '*', name: 'P', filePath: '', priority: 'medium', runEvery: 'never', runsTotal: 0,
      hasTasksFolder: true, hasAssetsFolder: false, content: '', raw: {},
      tasks: [
        { id: 't1', filePath: '', title: 'T1', progresso: 0, prioridade: 'medium', state: 'tarefinha', raw: {} },
        { id: 't2', filePath: '', title: 'T2', progresso: 100, prioridade: 'medium', state: 'concluida', raw: {} },
        { id: 't3', filePath: '', title: 'T3', progresso: 50, prioridade: 'medium', state: 'em-progresso', raw: {} },
      ],
    }
    const pending = getPendingTasks(p)
    expect(pending).toHaveLength(2)
    expect(pending.every(t => t.state !== 'concluida')).toBe(true)
  })
})

// ── Group H: end-to-end scanVault ─────────────────────────────────────────────

describe('scanVault (end-to-end fixture)', () => {
  it('returns correct VaultState with all project types and agents', async () => {
    // USP project
    write('10_Projects/PSI9999/PSI9999.md',
      '---\nid: PSI9999\nagent: "@study-assistant"\npriority: high\nrun_every: daily\n---\n# PSI9999')
    write('10_Projects/PSI9999/tasks/t1.md',
      '---\nprogresso: 0%\nprioridade: alta\n---\n# Task 1')

    // BB project (loose file)
    write('10_Projects/BB-Work.md',
      '---\nid: BB-Work\ntype: work\nagent: "@planner"\npriority: medium\n---\n# BB Work')

    // Meta project
    write('10_Projects/mytool/mytool.md',
      '---\nid: mytool\ntype: dev\nagent: "@planner"\npriority: low\n---\n# mytool')

    // Agent
    write('60_Agents/1_Directives/planner/directives.md',
      '---\nname: "@planner"\nrunner: claude\n---\nPlan work.')

    const { scanVault } = await import('../src/vault/index.js')
    const config = defineConfig({ vaultPath: tmpDir })
    const state = await scanVault(config)

    expect(state.projects).toHaveLength(3)
    expect(state.agents).toHaveLength(1)

    const usp = state.projects.find(p => p.id === 'PSI9999')!
    expect(usp.tipo).toBe('USP')
    expect(usp.tasks).toHaveLength(1)

    const bb = state.projects.find(p => p.id === 'BB-Work')!
    expect(bb.tipo).toBe('BB')
    expect(bb.folderPath).toBeUndefined()

    const meta = state.projects.find(p => p.id === 'mytool')!
    expect(meta.tipo).toBe('*')
  })
})
