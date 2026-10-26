import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { deviceStyles } from './device-styles'
export default defineConfig({
  plugins: [deviceStyles(), vue()],
  test: {
    name: 'mdm',
    root: fileURLToPath(new URL('.', import.meta.url)),
    environment: 'jsdom',
    server: { deps: { inline: ['vuetify'] } },
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.spec.ts', 'demo/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.vue'],
      exclude: [
        'src/contracts/collection/generated/**',
        'src/**/*.spec.ts',
        'src/test-setup.ts',
        'src/main.ts',
        'src/router.ts',
        'src/App.vue',
        'src/i18n/**',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
})
