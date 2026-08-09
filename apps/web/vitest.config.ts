import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    root: fileURLToPath(new URL('.', import.meta.url)),
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.vue'],
      exclude: [
        'src/**/*.spec.ts',
        'src/main.ts',
        // Bootstrap glue / placeholder views / route config: no independent unit test path.
        // Coverage provided by integration tests and Playwright e2e smoke tests.
        'src/App.vue',
        'src/views/HomeView.vue',
        'src/router/index.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
})
