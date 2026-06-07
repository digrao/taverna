import { describe, it, expect } from 'vitest'
import { CommandRegistry } from '../../src/core/types.js'
import type { CommandDef, TavernaContext } from '../../src/core/types.js'
import { NotificationBus } from '../../src/notifications/bus.js'
import type { TavernaConfig } from '../../src/config.js'

function ctx(): TavernaContext {
  const config = { vaultPath: '/vault', projectsDir: '10_Projects', flowDir: 'flows', port: 3861, plugins: [] }
  return { config: config as TavernaConfig, notificationBus: new NotificationBus() }
}

function cmd(overrides: Partial<CommandDef> = {}): CommandDef {
  return {
    id: 'ping',
    description: 'Health check',
    handler: async () => ({ ok: true }),
    ...overrides,
  }
}

describe('CommandRegistry', () => {
  it('finds a command by namespace + id — they are the identity key together', () => {
    const registry = new CommandRegistry()
    registry.register(cmd())
    registry.register(cmd(), 'assets')

    expect(registry.find(undefined, 'ping')?.namespace).toBeUndefined()
    expect(registry.find('assets', 'ping')?.namespace).toBe('assets')
    expect(registry.find('other', 'ping')).toBeUndefined()
  })

  it('lets a plugin command share an id with a core command without colliding', () => {
    const registry = new CommandRegistry()
    registry.register(cmd({ description: 'core ping' }))
    registry.register(cmd({ description: 'plugin ping' }), 'assets')

    expect(registry.find(undefined, 'ping')?.description).toBe('core ping')
    expect(registry.find('assets', 'ping')?.description).toBe('plugin ping')
  })

  describe('listFor', () => {
    it('includes a command on every protocol when `expose` is omitted', () => {
      const registry = new CommandRegistry()
      registry.register(cmd())

      for (const protocol of ['http', 'mcp', 'cli'] as const) {
        expect(registry.listFor(protocol).map((c) => c.id)).toContain('ping')
      }
    })

    it('excludes a command from every protocol when `expose` is []', () => {
      const registry = new CommandRegistry()
      registry.register(cmd({ expose: [] }))

      for (const protocol of ['http', 'mcp', 'cli'] as const) {
        expect(registry.listFor(protocol)).toEqual([])
      }
    })

    it('includes a command only on the protocols listed in `expose`', () => {
      const registry = new CommandRegistry()
      registry.register(cmd({ expose: ['cli'] }))

      expect(registry.listFor('cli').map((c) => c.id)).toContain('ping')
      expect(registry.listFor('http')).toEqual([])
      expect(registry.listFor('mcp')).toEqual([])
    })
  })

  describe('execute', () => {
    it('returns an error envelope for an unknown command', async () => {
      const registry = new CommandRegistry()
      const result = await registry.execute(undefined, 'missing', {}, ctx())

      expect(result.data).toBeUndefined()
      expect(result.error).toMatch(/not found/i)
    })

    it('returns an error envelope for an unknown namespaced command, including the namespace', async () => {
      const registry = new CommandRegistry()
      const result = await registry.execute('assets', 'missing', {}, ctx())

      expect(result.error).toContain('assets.missing')
    })

    it('validates params against the JSON Schema before invoking the handler', async () => {
      const registry = new CommandRegistry()
      const handler = async (params: Record<string, unknown>) => ({ echoed: params['name'] })
      registry.register(
        cmd({
          id: 'greet',
          params: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
          handler,
        }),
      )

      const missing = await registry.execute(undefined, 'greet', {}, ctx())
      expect(missing.error).toBeDefined()
      expect(missing.data).toBeUndefined()

      const ok = await registry.execute(undefined, 'greet', { name: 'world' }, ctx())
      expect(ok.error).toBeUndefined()
      expect(ok.data).toEqual({ echoed: 'world' })
    })

    it('wraps a handler return value in {data} on success', async () => {
      const registry = new CommandRegistry()
      registry.register(cmd({ handler: async () => ({ pong: true }) }))

      const result = await registry.execute(undefined, 'ping', {}, ctx())
      expect(result).toEqual({ data: { pong: true } })
    })

    it('wraps a handler exception in {error} instead of throwing', async () => {
      const registry = new CommandRegistry()
      registry.register(cmd({ handler: async () => { throw new Error('boom') } }))

      const result = await registry.execute(undefined, 'ping', {}, ctx())
      expect(result).toEqual({ error: 'boom' })
    })
  })
})
