/**
 * HTTP Server Integration Pattern
 *
 * Shows how to refactor routes.ts to use Command Handler without breaking anything.
 * This is a TEMPLATE — não modifica routes.ts ainda.
 *
 * Padrão:
 *   Old: router.get('/api/state', handler => { /* logic here * / })
 *   New: router.get('/api/state', handler => executeCommand('state', ...))
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { executeCommand } from '../core/server-api.js'
import type { CommandContext } from '../core/command-handler.js'

/** Helper to parse JSON body */
async function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk.toString()
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        resolve({})
      }
    })
  })
}

/** HTTP handler wrapper */
export async function httpCommand(
  req: IncomingMessage,
  res: ServerResponse,
  commandId: string,
  ctx: CommandContext,
  queryArgs?: Record<string, unknown>,
) {
  try {
    const bodyArgs = await parseBody(req)
    const args = { ...queryArgs, ...bodyArgs }

    const result = await executeCommand(commandId, args, ctx)

    res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(result))
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : 'unknown error',
      }),
    )
  }
}

/**
 * Example refactor of a route:
 *
 * // OLD (em routes.ts):
 * router.get('/api/state', async (req, res) => {
 *   const vault = await scanVault(cache.config)
 *   const projects = vault.projects.map(...)
 *   res.writeHead(200, {...})
 *   res.end(JSON.stringify(projects))
 * })
 *
 * // NEW (em routes.ts):
 * router.get('/api/state', async (req, res) => {
 *   await httpCommand(req, res, 'state', { config: cache.config, vaultPath: cache.config.vaultPath })
 * })
 */
