import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts', 'src/http/**', 'src/mcp/**'],
      // Baseline floor for the new core test suite (flow engine, registry, bus,
      // frontmatter) — raise these as vault/plugin/adapter coverage grows.
      thresholds: { lines: 20, functions: 55, branches: 75 },
    },
  },
})
