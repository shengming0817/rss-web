import { defineConfig, devices } from '@playwright/test'

const phase = process.env.RSS_WEB_REAL_PHASE ?? 'main'

export default defineConfig({
  testDir: 'e2e/real',
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  grep: new RegExp(`@${phase.replaceAll('-', '\\-')}\\b`),
  use: {
    baseURL: process.env.RSS_WEB_REAL_BASE_URL,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [{ name: 'real-chromium', use: { ...devices['Desktop Chrome'] } }],
})
