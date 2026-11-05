import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  test: {
    name: 'device-access-app',
    root: fileURLToPath(new URL('.', import.meta.url)),
    environment: 'jsdom',
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx', 'demo/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/services/*.ts', 'src/config.ts'],
      exclude: ['src/**/*.spec.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
})
