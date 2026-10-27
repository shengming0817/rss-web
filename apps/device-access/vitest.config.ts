import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { vuetifyStyles } from '../../build/vuetify-styles.mjs'
import { accessThemes } from './themes'
export default defineConfig({
  plugins: [vuetifyStyles('.access-surface', accessThemes), vue()],
  test: {
    name: 'device-access-app',
    root: fileURLToPath(new URL('.', import.meta.url)),
    environment: 'jsdom',
    server: { deps: { inline: ['vuetify'] } },
    include: ['src/**/*.spec.ts', 'demo/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/main.ts',
        'src/bootstrap.ts',
        'src/router.ts',
        'src/i18n/**',
        'src/ui/**',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
})
