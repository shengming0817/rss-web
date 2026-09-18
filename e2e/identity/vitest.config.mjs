import process from 'node:process'
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    name: 'identity-joint',
    setupFiles: ['e2e/identity/origin.mjs'],
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: process.env.IDENTITY_TEST_UI_ORIGIN } },
    include: ['e2e/identity/transport.spec.ts'],
    testTimeout: 60000,
    fileParallelism: false,
  },
})
