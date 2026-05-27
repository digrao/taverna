import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { join } from 'node:path'
import { syncAssets, listUnprocessed } from '../edisciplinas/registry.js'
import { addTask } from '../vault/task-scaffold.js'
import { scaffoldProject } from '../vault/project-scaffold.js'
import { features } from '../infra/feature-map.js'
import type { FeatureContext, FeatureDef } from '../infra/feature-map.js'
import { defineConfig } from '../config.js'
import { loadPlugins, collectPluginFeatures } from '../plugin/loader.js'

// stdout is the MCP protocol channel — never write there directly
const log = (...args: unknown[]) => process.stderr.write(args.join(' ') + '\n')

const VAULT_PATH = process.env['VAULT_PATH'] ?? ''
const PROJECTS_DIR = join(VAULT_PATH, '10_Projects')

const ctx: FeatureContext = {
  vaultPath: VAULT_PATH,
  config: defineConfig({ vaultPath: VAULT_PATH }),
}

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

function err(message: string) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }] }
}

const server = new McpServer({ name: 'taverna', version: '0.1.0' })

// ── Auto-registered feature tools ──────────────────────────────────────────────
// Core features + plugin features all become taverna_<name> MCP tools.

const plugins = await loadPlugins()
const allFeatures: FeatureDef[] = [...features, ...collectPluginFeatures(plugins)]

for (const feature of allFeatures) {
  server.tool(
    `taverna_${feature.name}`,
    feature.description,
    feature.params,
    async (params: Record<string, unknown>) => {
      try {
        const result = await feature.handler(params, ctx)
        return ok(result)
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e))
      }
    },
  )
}

// ── Scaffold tools ─────────────────────────────────────────────────────────────
// These are not in the feature map — they have complex param schemas and are
// vault-write operations that don't belong in the read/action feature registry.

server.tool(
  'taverna_add_task',
  'Create a task in a vault project. type=generic for dev/infra tasks; USP-aula/USP-entrega for study tasks.',
  {
    projectId: z.string().describe('Project ID (e.g. PSI3451 or taverna)'),
    type: z.enum(['USP-aula', 'USP-entrega', 'generic']),
    topic: z.string().describe('Task topic — used to generate the task id and heading'),
    prioridade: z.enum(['alta', 'média', 'baixa']),
    deadline: z.string().optional().describe('YYYY-MM-DD; required for USP-entrega'),
    body: z.string().optional().describe('Optional markdown body for generic tasks'),
    depende: z.array(z.string()).optional().describe('Task IDs this generic task depends on'),
    assetFolder: z
      .string()
      .optional()
      .describe('Relative asset folder name (e.g. 05_Aula); USP only'),
    workspace: z.string().optional().describe('Workspace path; USP only'),
    dependsOn: z
      .array(z.string())
      .optional()
      .describe('Task IDs; USP only (use depende for generic)'),
  },
  async ({
    projectId,
    type,
    topic,
    prioridade,
    deadline,
    body,
    depende,
    assetFolder,
    workspace,
    dependsOn,
  }) => {
    const projectFolderPath = join(PROJECTS_DIR, projectId)
    if (type === 'generic') {
      const result = await addTask(projectFolderPath, projectId, {
        type: 'generic',
        topic,
        prioridade,
        ...(deadline ? { deadline } : {}),
        ...(body ? { body } : {}),
        ...(depende && depende.length > 0 ? { depende } : {}),
      })
      return ok(result)
    }
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
  'Create a new vault project with the standard folder structure. Idempotent.',
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
// These will be removed in the prune task (task 57) when edisciplinas moves to
// its own subproject.

server.tool(
  'taverna_sync_all',
  'Sync all e-Disciplinas registries for every discipline that has a .edisciplinas.json registry',
  {},
  async () => {
    const { syncAllRegistries } = await import('../edisciplinas/registry.js')
    const stats = await syncAllRegistries(VAULT_PATH)
    return ok({ synced: true, stats })
  },
)

server.tool(
  'taverna_mark_processed',
  'Mark an e-Disciplinas material as processed by discipline ID and URL hash',
  {
    id: z.string().describe('Discipline ID (e.g. PSI3451)'),
    hash: z.string().describe('URL hash of the item to mark as processed (url_hash field)'),
  },
  async ({ id, hash }) => {
    const { markProcessed } = await import('../edisciplinas/registry.js')
    const marked = await markProcessed(id, hash, VAULT_PATH)
    return ok({ marked, id, hash })
  },
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

log(`taverna MCP server starting (vault: ${VAULT_PATH || '(VAULT_PATH not set)'})`)

const transport = new StdioServerTransport()
await server.connect(transport)
