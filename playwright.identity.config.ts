import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: 'e2e/identity',
  testMatch: '*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  use: { baseURL: 'http://localhost:5175', ...devices['Desktop Chrome'], trace: 'off' },
  webServer: {
    command: 'pnpm -F @rss/identity-app dev --port 5175',
    port: 5175,
    reuseExistingServer: !process.env['CI'],
  },
})
