import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { environment: 'node', include: ['e2e/mdm/registration.spec.ts'], testTimeout: 30000 },
})
