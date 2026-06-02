/**
 * Tests de integração para Command Handler
 *
 * Verifica que:
 * - Registry funciona
 * - Handlers podem ser executados
 * - Tipos estão corretos
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { CommandRegistry, type CommandContext } from '../../dist/commands/types.js'
import { defineConfig } from '../../dist/config.js'

describe('Command Registry', () => {
  let registry: CommandRegistry

  beforeEach(() => {
    registry = new CommandRegistry()
  })

  it('registra um comando', () => {
    registry.register({
      id: 'test',
      description: 'Test command',
      handler: async () => ({ success: true }),
    })

    expect(registry.get('test')).toBeDefined()
  })

  it('executa um comando registrado', async () => {
    registry.register({
      id: 'test',
      description: 'Test command',
      handler: async (_args, _ctx) => ({
        success: true,
        data: { value: 42 },
      }),
    })

    const ctx: CommandContext = {
      config: defineConfig({ vaultPath: '/tmp' }),
      vaultPath: '/tmp',
    }

    const result = await registry.execute('test', {}, ctx)

    expect(result.success).toBe(true)
    expect((result as any).data?.value).toBe(42)
    expect(result.metadata?.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('retorna erro para comando não encontrado', async () => {
    const ctx: CommandContext = {
      config: defineConfig({ vaultPath: '/tmp' }),
      vaultPath: '/tmp',
    }

    const result = await registry.execute('nonexistent', {}, ctx)

    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('lista todos os comandos', () => {
    registry.register({
      id: 'cmd1',
      description: 'First',
      handler: async () => ({ success: true }),
    })
    registry.register({
      id: 'cmd2',
      description: 'Second',
      handler: async () => ({ success: true }),
    })

    const all = registry.list()
    expect(all).toHaveLength(2)
    expect(all.map((c) => c.id)).toEqual(['cmd1', 'cmd2'])
  })

  it('captura erros de handler', async () => {
    registry.register({
      id: 'failing',
      description: 'Failing command',
      handler: async () => {
        throw new Error('test error')
      },
    })

    const ctx: CommandContext = {
      config: defineConfig({ vaultPath: '/tmp' }),
      vaultPath: '/tmp',
    }

    const result = await registry.execute('failing', {}, ctx)

    expect(result.success).toBe(false)
    expect(result.error).toContain('test error')
  })

  it('mede duração de execução', async () => {
    registry.register({
      id: 'slow',
      description: 'Slow command',
      handler: async () => {
        await new Promise((r) => setTimeout(r, 20))
        return { success: true }
      },
    })

    const ctx: CommandContext = {
      config: defineConfig({ vaultPath: '/tmp' }),
      vaultPath: '/tmp',
    }

    const result = await registry.execute('slow', {}, ctx)

    expect(result.metadata?.durationMs).toBeGreaterThanOrEqual(10)
  })
})
