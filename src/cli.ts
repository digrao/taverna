#!/usr/bin/env node
import { Command } from 'commander'
import { createInterface } from 'node:readline/promises'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { loadConfig } from './config.js'
import { coreCommands } from './core/index.js'
import type { JsonSchema, RegisteredCommand, TavernaContext } from './core/types.js'
import { NotificationBus } from './notifications/index.js'
import { loadPlugins } from './plugin/loader.js'

const _req = createRequire(import.meta.url)
const { version } = _req('../package.json') as { version: string }

/** Interactive prompter for fields the flow pipeline can't resolve on its own (e.g. `move_task`). */
function cliPrompt(field: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return rl.question(`${field}: `).finally(() => rl.close())
}

function buildContext(configPath: string | undefined): TavernaContext {
  try {
    return { config: loadConfig(configPath), notificationBus: new NotificationBus(), prompt: cliPrompt }
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  }
}

function extractConfigPath(argv: string[]): string | undefined {
  const i = argv.indexOf('--config')
  return i !== -1 ? argv[i + 1] : undefined
}

interface ParamEntry {
  name: string
  required: boolean
  schema: JsonSchema
}

/** Each `CommandDef.params` property becomes a `--<name>` flag — required ones via `requiredOption`. */
function paramEntries(schema: JsonSchema | undefined): ParamEntry[] {
  const properties = (schema?.['properties'] as Record<string, JsonSchema> | undefined) ?? {}
  const required = new Set((schema?.['required'] as string[] | undefined) ?? [])
  return Object.entries(properties).map(([name, propSchema]) => ({
    name,
    required: required.has(name),
    schema: propSchema,
  }))
}

function coerce(value: string, schema: JsonSchema): unknown {
  switch (schema['type']) {
    case 'number':
    case 'integer':
      return Number(value)
    case 'array':
      return value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    case 'boolean':
      return value === 'true'
    default:
      return value
  }
}

function registerCommand(target: Command, cmd: RegisteredCommand, ctx: TavernaContext): void {
  const entries = paramEntries(cmd.params)
  const sub = target.command(cmd.id).description(cmd.description)

  for (const { name, required, schema } of entries) {
    const flag = `--${name} <value>`
    const description = typeof schema['description'] === 'string' ? schema['description'] : ''
    if (required) sub.requiredOption(flag, description)
    else sub.option(flag, description)
  }

  sub.action(async (opts: Record<string, string | undefined>) => {
    const params: Record<string, unknown> = {}
    for (const { name, schema } of entries) {
      const raw = opts[name]
      if (raw !== undefined) params[name] = coerce(raw, schema)
    }

    const result = await coreCommands.execute(cmd.namespace, cmd.id, params, ctx)
    if (result.error !== undefined) {
      console.error(result.error)
      process.exitCode = 1
      return
    }
    console.log(JSON.stringify(result.data, null, 2))
  })
}

async function main(): Promise<void> {
  const ctx = buildContext(extractConfigPath(process.argv))
  await loadPlugins(ctx.config, ctx.notificationBus)

  const program = new Command('taverna')
    .description('Vault-first project orchestrator — commands generated from the core registry')
    .version(version)
    .option('--config <path>', 'Path to the taverna config file (default: ~/.config/taverna/config.json)')

  const commands = coreCommands.listFor('cli')
  const byNamespace = new Map<string, RegisteredCommand[]>()
  for (const cmd of commands) {
    if (cmd.namespace === undefined) {
      registerCommand(program, cmd, ctx)
      continue
    }
    const list = byNamespace.get(cmd.namespace) ?? []
    list.push(cmd)
    byNamespace.set(cmd.namespace, list)
  }

  for (const [namespace, nsCommands] of byNamespace) {
    const nsProgram = program.command(namespace).description(`${namespace} plugin commands`)
    for (const cmd of nsCommands) registerCommand(nsProgram, cmd, ctx)
  }

  program
    .command('serve')
    .description('Start the persistent HTTP server (taverna serve)')
    .option('--port <n>', 'Port to listen on (default: from config, or 3861)')
    .action(async (opts: { port?: string }) => {
      const { createServer } = await import('./http/server/index.js')
      await createServer(ctx, opts.port !== undefined ? { port: Number(opts.port) } : {})
    })

  program
    .command('mcp')
    .description('Start the MCP server over stdio — exposes commands as taverna_<...> tools')
    .action(async () => {
      const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')
      const { createMcpServer } = await import('./mcp/server.js')
      await createMcpServer(ctx).connect(new StdioServerTransport())
    })

  program
    .command('create-plugin <name>')
    .description('Scaffold a new taverna plugin in ~/tools/taverna-<name>/')
    .option(
      '--dir <path>',
      'Parent directory for the new plugin',
      join(dirname(_req.resolve('../package.json')), '..'),
    )
    .option('--with-cli', 'Also scaffold a src/cli.ts entry point')
    .action(async (name: string, opts: { dir: string; withCli?: boolean }) => {
      const { scaffoldPlugin } = await import('./plugin/scaffold.js')
      try {
        const { pluginDir, files } = await scaffoldPlugin({
          name,
          targetDir: opts.dir,
          withCli: opts.withCli,
        })
        console.log(`created ${pluginDir}`)
        for (const f of files) console.log(`  ${f}`)
        console.log(`\nnext steps:\n  cd ${pluginDir}\n  npm install\n  npm run build`)
      } catch (e) {
        console.error(e instanceof Error ? e.message : String(e))
        process.exitCode = 1
      }
    })

  await program.parseAsync(process.argv)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exitCode = 1
})
