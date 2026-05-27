import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { join } from 'node:path'
import { syncAssets, listUnprocessed } from '../edisciplinas/registry.js'
import { addTask } from '../vault/task-scaffold.js'
import { scaffoldProject } from '../vault/project-scaffold.js'

// stdout is the MCP protocol channel — never write there directly
const log = (...args: unknown[]) => process.stderr.write(args.join(' ') + '\n')

const BASE = process.env['TAVERNA_API_URL'] ?? 'http://localhost:2948'

async function get(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${res.statusText}`)
  return res.json()
}

async function post(path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    ...(body !== undefined
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  })
  if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${res.statusText}`)
  return res.json()
}

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

const server = new McpServer({ name: 'taverna', version: '0.1.0' })

// ── Read tools ─────────────────────────────────────────────────────────────────
// Each entry maps 1:1 to an HTTP route on the taverna server (:2948).
// To expose a new endpoint: add a server.tool() call below.

server.tool(
  'taverna_state',
  'All projects with health status, daily costs, and task progress',
  {},
  async () => ok(await get('/api/state')),
)

server.tool('taverna_active', 'Currently running agent sessions', {}, async () =>
  ok(await get('/api/active')),
)

server.tool('taverna_costs', "Today's cost breakdown by project + total", {}, async () =>
  ok(await get('/api/costs')),
)

server.tool(
  'taverna_budget_status',
  'Token and USD budget usage today — global total and per-project breakdown',
  {},
  async () => ok(await get('/api/budget')),
)

server.tool('taverna_projects', 'List all vault projects with their frontmatter', {}, async () =>
  ok(await get('/projects')),
)

server.tool(
  'taverna_project',
  'Get a specific project by ID, including tasks and health',
  { id: z.string().describe('Project ID (e.g. PSI3451, taverna)') },
  async ({ id }) => ok(await get(`/projects/${id}`)),
)

server.tool(
  'taverna_agents',
  'List all available agents with their directive metadata',
  {},
  async () => ok(await get('/agents')),
)

server.tool(
  'taverna_inbox',
  'Pending agent-action-required items awaiting human input',
  {},
  async () => ok(await get('/inbox')),
)

server.tool(
  'taverna_backlinks',
  'Find all vault files that link to a given note',
  { note: z.string().describe('Note name or path relative to vault root') },
  async ({ note }) => ok(await get(`/backlinks?note=${encodeURIComponent(note)}`)),
)

// ── Action tools ───────────────────────────────────────────────────────────────

server.tool(
  'taverna_run_all',
  'Trigger taverna execute — runs agents on all eligible projects',
  {},
  async () => ok(await post('/api/run')),
)

server.tool(
  'taverna_drain_all',
  'Trigger taverna execute --drain — drains task queues in all eligible projects',
  {},
  async () => ok(await post('/api/drain')),
)

server.tool(
  'taverna_run_project',
  'Run an agent on a specific project immediately',
  { id: z.string().describe('Project ID') },
  async ({ id }) => ok(await post(`/api/run/${id}`)),
)

// ── Session tools ──────────────────────────────────────────────────────────────

server.tool(
  'taverna_session_preview',
  'Show eligible unblocked tasks grouped by project for batched session execution',
  { project: z.string().optional().describe('Filter to a specific project ID') },
  async ({ project }) => {
    const path = project
      ? `/api/session/preview?project=${encodeURIComponent(project)}`
      : '/api/session/preview'
    return ok(await get(path))
  },
)

server.tool(
  'taverna_session_run',
  'Launch a batched agent session for a project — all eligible tasks run in one context window to maximise cache reuse',
  {
    project: z.string().describe('Project ID (e.g. taverna, PSI3451)'),
    tasks: z
      .string()
      .optional()
      .describe('Comma-separated task IDs to include (default: all unblocked pending)'),
  },
  async ({ project, tasks }) =>
    ok(await post('/api/session/run', { project, ...(tasks ? { tasks } : {}) })),
)

// ── Scaffold tools ─────────────────────────────────────────────────────────────

const VAULT_PATH = process.env['VAULT_PATH'] ?? ''
const PROJECTS_DIR = join(VAULT_PATH, '10_Projects')

server.tool(
  'taverna_add_task',
  'Create a USP task (aula or entrega) in a vault project. Derives the task id from the topic.',
  {
    projectId: z.string().describe('Project ID (e.g. PSI3451)'),
    type: z.enum(['USP-aula', 'USP-entrega']),
    topic: z.string().describe('Task topic — used to generate the task id and heading'),
    prioridade: z.enum(['alta', 'média', 'baixa']),
    deadline: z.string().optional().describe('YYYY-MM-DD; required for USP-entrega'),
    assetFolder: z.string().optional().describe('Relative asset folder name (e.g. 05_Aula)'),
    workspace: z.string().optional().describe('Workspace path for the task'),
    dependsOn: z.array(z.string()).optional().describe('Task IDs this task depends on'),
  },
  async ({ projectId, type, topic, prioridade, deadline, assetFolder, workspace, dependsOn }) => {
    const projectFolderPath = join(PROJECTS_DIR, projectId)
    const result = await addTask(projectFolderPath, projectId, {
      type,
      topic,
      prioridade,
      ...(deadline ? { deadline } : {}),
      ...(assetFolder ? { assetFolder } : {}),
      ...(workspace ? { workspace } : {}),
      ...(dependsOn ? { dependsOn } : {}),
    })
    return ok(result)
  },
)

server.tool(
  'taverna_scaffold_project',
  'Create a new vault project with the standard folder structure (main .md, Logbook, Progresso, Material, tasks/, assets/, entregas/). Idempotent.',
  {
    id: z.string().describe('Project ID (e.g. PSI3471)'),
    name: z.string().describe('Human-readable project name'),
    tipo: z.enum(['USP', '*']).optional(),
    agent: z.string().optional().describe('Agent directive name (e.g. @study-assistant)'),
    priority: z.string().optional().describe('Project priority (high | medium | low)'),
    edisciplinas: z.string().optional().describe('e-Disciplinas course URL'),
    horarios: z
      .array(
        z.object({
          dia: z.string(),
          hora: z.string(),
          local: z.string().optional(),
        }),
      )
      .optional(),
    contatos: z.array(z.string()).optional(),
  },
  async ({ id, name, tipo, agent, priority, edisciplinas, horarios, contatos }) => {
    const result = await scaffoldProject(PROJECTS_DIR, {
      id,
      name,
      ...(tipo ? { tipo } : {}),
      ...(agent ? { agent } : {}),
      ...(priority ? { priority } : {}),
      ...(edisciplinas ? { edisciplinas } : {}),
      ...(horarios ? { horarios } : {}),
      ...(contatos ? { contatos } : {}),
    })
    return ok(result)
  },
)

// ── e-Disciplinas tools ────────────────────────────────────────────────────────

server.tool(
  'taverna_sync_all',
  'Sync all e-Disciplinas registries for every discipline that has a .edisciplinas.json registry',
  {},
  async () => ok(await post('/api/edisciplinas/sync')),
)

server.tool(
  'taverna_mark_processed',
  'Mark an e-Disciplinas material as processed by discipline ID and URL hash',
  {
    id: z.string().describe('Discipline ID (e.g. PSI3451)'),
    hash: z.string().describe('URL hash of the item to mark as processed (url_hash field)'),
  },
  async ({ id, hash }) =>
    ok(await post(`/api/edisciplinas/mark/${encodeURIComponent(id)}/${encodeURIComponent(hash)}`)),
)

server.tool(
  'taverna_sync_assets',
  'Sync _edisciplinas_metadata.json with the discipline registry (.edisciplinas.json)',
  { id: z.string().describe('Discipline ID (e.g. PSI3451)') },
  async ({ id }) => {
    const stats = await syncAssets(id, VAULT_PATH)
    return { content: [{ type: 'text' as const, text: JSON.stringify(stats) }] }
  },
)

server.tool(
  'taverna_list_unprocessed',
  'List unprocessed e-Disciplinas materials by priority for a discipline',
  { id: z.string().describe('Discipline ID (e.g. PSI3451)') },
  async ({ id }) => {
    const items = await listUnprocessed(id, VAULT_PATH)
    return { content: [{ type: 'text' as const, text: JSON.stringify(items) }] }
  },
)

// ── Connect ────────────────────────────────────────────────────────────────────

log(`taverna MCP server starting (api: ${BASE})`)

const transport = new StdioServerTransport()
await server.connect(transport)
