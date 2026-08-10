import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    // Cold dynamic imports can exceed Vitest's 5s default while all workspace
    // projects execute concurrently on CI runners.
    testTimeout: 10_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.vue'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/__tests__/**',
        // Barrel re-export files — no logic to test
        'src/index.ts',
        'src/components/index.ts',
        'src/composables/index.ts',
        'src/stores/index.ts',
        'src/ui/index.ts',
        // Pure data / type files — v8 over-counts branches on `as const` expressions
        'src/i18n/messages/zh-CN.ts',
        'src/i18n/messages/en-US.ts',
        'src/ui/navConfig.ts',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
})
