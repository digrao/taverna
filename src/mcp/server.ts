import { createRequire } from 'node:module'
import { join } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { allCommands } from '../core/index.js'
import type { TavernaContext } from '../core/types.js'
import { loadConfig } from '../config.js'
import { loadPluginCommands } from '../plugin/loader.js'
import { notificationBus } from '../notifications/bus.js'
import { addTask } from '../vault/task-scaffold.js'
import { scaffoldProject } from '../vault/project-scaffold.js'

const _req = createRequire(import.meta.url)
const { version } = _req('../../package.json') as { version: string }

// stdout is the MCP protocol channel — never write there directly
const log = (...args: unknown[]) => process.stderr.write(args.join(' ') + '\n')

const config = loadConfig()
const VAULT_PATH = config.vaultPath
const PROJECTS_DIR = join(VAULT_PATH, '10_Projects')

const ctx: TavernaContext = { vaultPath: VAULT_PATH, config, notificationBus }

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

function err(message: string) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }] }
}

const server = new McpServer({ name: 'taverna', version })

// ── Auto-registered commands ────────────────────────────────────────────────────
// All HTTP-exposed core commands + plugin commands become taverna_<id> MCP tools.

const pluginCommands = await loadPluginCommands()
const exposed = [...allCommands, ...pluginCommands].filter((c) => c.http !== undefined)

for (const cmd of exposed) {
  server.tool(
    `taverna_${cmd.id}`,
    cmd.description,
    cmd.params ?? {},
    async (params: Record<string, unknown>) => {
      try {
        const result = await cmd.handler(params, ctx)
        return ok(result)
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e))
      }
    },
  )
}

// ── Vault write tools ────────────────────────────────────────────────────────────
// Complex write operations with discriminated schemas — registered separately.

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
    assetFolder: z.string().optional().describe('Relative asset folder (e.g. 05_Aula); USP only'),
    workspace: z.string().optional().describe('Workspace path; USP only'),
    dependsOn: z.array(z.string()).optional().describe('Task IDs; USP only'),
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
      .array(z.object({ dia: z.string(), hora: z.string(), local: z.string().optional() }))
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

// ── Connect ─────────────────────────────────────────────────────────────────────

log(`taverna MCP server starting (vault: ${VAULT_PATH || '(VAULT_PATH not set)'})`)

const transport = new StdioServerTransport()
await server.connect(transport)
