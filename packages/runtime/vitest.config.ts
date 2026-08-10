import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@rss/runtime',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.typecheck.ts', 'src/**/index.ts'],
      thresholds: { lines: 85, functions: 85, branches: 85, statements: 85 },
    },
  },
})
