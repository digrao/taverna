import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export interface ScaffoldOptions {
  /** Plugin name without the "taverna-" prefix, e.g. "notes" → taverna-notes */
  name: string
  /** Parent directory where taverna-<name>/ will be created */
  targetDir: string
  /** Scaffold a src/cli.ts entry point in addition to src/index.ts */
  withCli?: boolean | undefined
}

export interface ScaffoldResult {
  pluginDir: string
  files: string[]
}

export async function scaffoldPlugin(opts: ScaffoldOptions): Promise<ScaffoldResult> {
  const baseName = opts.name.startsWith('taverna-') ? opts.name.slice('taverna-'.length) : opts.name
  const pluginDir = join(opts.targetDir, `taverna-${baseName}`)
  if (existsSync(pluginDir)) {
    throw new Error(`directory already exists: ${pluginDir}`)
  }

  await mkdir(join(pluginDir, 'src'), { recursive: true })
  await mkdir(join(pluginDir, 'tests'), { recursive: true })

  const files: string[] = []

  async function write(rel: string, content: string): Promise<void> {
    await writeFile(join(pluginDir, rel), content, 'utf-8')
    files.push(rel)
  }

  const pkg = {
    name: `taverna-${baseName}`,
    version: '0.1.0',
    description: '',
    type: 'module',
    ...(opts.withCli ? { bin: { [`taverna-${baseName}`]: './dist/cli.js' } } : {}),
    scripts: {
      build: 'tsc',
      typecheck: 'tsc --noEmit',
      lint: 'eslint src --max-warnings 0',
      'lint:fix': 'eslint src --fix',
      test: 'vitest run',
      ci: 'npm run typecheck && npm run lint && npm test',
      prepare: 'simple-git-hooks || true',
    },
    dependencies: {
      ...(opts.withCli ? { commander: '^14.0.0' } : {}),
      taverna: 'file:../taverna',
    },
    devDependencies: {
      '@eslint/js': '^10.0.0',
      '@types/node': '^25.0.0',
      '@typescript-eslint/eslint-plugin': '^8.0.0',
      '@typescript-eslint/parser': '^8.0.0',
      eslint: '^10.0.0',
      'lint-staged': '^17.0.0',
      prettier: '^3.0.0',
      'simple-git-hooks': '^2.0.0',
      'typescript-eslint': '^8.0.0',
      typescript: '^5.0.0',
      vitest: '^2.0.0',
    },
    'lint-staged': { '*.ts': ['eslint --fix', 'prettier --write'] },
    'simple-git-hooks': { 'pre-commit': 'npx lint-staged' },
  }

  await write('package.json', JSON.stringify(pkg, null, 2) + '\n')

  await write(
    'tsconfig.json',
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          outDir: 'dist',
          rootDir: 'src',
          strict: true,
          declaration: true,
          declarationMap: true,
          sourceMap: true,
          lib: ['ES2022'],
          types: ['node'],
          skipLibCheck: true,
        },
        include: ['src/**/*'],
        exclude: ['node_modules', 'dist'],
      },
      null,
      2,
    ) + '\n',
  )

  await write(
    'eslint.config.js',
    `import js from '@eslint/js'
import ts from 'typescript-eslint'

export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
      'no-console': 'off',
    },
    languageOptions: {
      parser: ts.parser,
      parserOptions: { project: './tsconfig.json' },
    },
  },
  { ignores: ['dist/**', 'node_modules/**', '*.config.js'] },
]
`,
  )

  await write(
    '.gitignore',
    `node_modules/
dist/
*.auth.json
`,
  )

  await write(
    'src/index.ts',
    `import type { TavernaPlugin } from 'taverna/plugin'
import type { CommandDef, TavernaContext } from 'taverna/core'
import type { NotificationBus } from 'taverna/notifications'

const commands: CommandDef[] = [
  {
    id: '${baseName}_ping',
    description: 'Health check',
    params: {},
    http: { method: 'GET', path: '/api/${baseName}/ping' },
    handler: async (_: Record<string, unknown>, ctx: TavernaContext) => {
      return { ok: true, vault: ctx.vaultPath }
    },
  },
]

const plugin: TavernaPlugin = {
  name: 'taverna-${baseName}',

  // ── Commands (MCP tools + HTTP endpoints) ────────────────────────────
  commands,

  // ── Notification sink (optional) ─────────────────────────────────────
  onLoad(bus: NotificationBus) {
    bus.addSink({
      name: '${baseName}-sink',
      send: async (_msg) => { /* TODO: forward notification */ },
    })
  },

  // ── Scheduler hooks (optional) ───────────────────────────────────────
  // scheduling: {
  //   scoring: {
  //     score(project, agentId, ctx) {
  //       return { project, agentId, score: 0, factors: [] }
  //     },
  //     rank(projects, agentDefaults, ctx) {
  //       return projects
  //         .map(p => this.score(p, agentDefaults[p.tipo] ?? '', ctx))
  //         .sort((a, b) => b.score - a.score)
  //     },
  //   },
  // },
}

export default plugin
`,
  )

  await write(
    'tests/plugin.test.ts',
    `import { describe, it, expect } from 'vitest'
import plugin from '../src/index.js'

describe('taverna-${baseName} plugin', () => {
  it('has a name', () => {
    expect(plugin.name).toBe('taverna-${baseName}')
  })

  it('exports at least one command', () => {
    expect(plugin.commands?.length).toBeGreaterThan(0)
  })

  it('all commands have required fields', () => {
    for (const c of plugin.commands ?? []) {
      expect(c.id).toBeTruthy()
      expect(c.description).toBeTruthy()
      expect(typeof c.handler).toBe('function')
    }
  })
})
`,
  )

  if (opts.withCli) {
    await write(
      'src/cli.ts',
      `#!/usr/bin/env node
import { Command } from 'commander'
import plugin from './index.js'

const program = new Command('taverna-${baseName}').description(plugin.name).version('0.1.0')

program
  .command('ping')
  .description('Health check')
  .action(() => {
    console.log('ok')
  })

program.parse()
`,
    )
  }

  return { pluginDir, files }
}
