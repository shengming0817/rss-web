import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright 冒烟测试配置 — T028
 * 仅 chromium；覆盖 shell 渲染 + 主题切换两条关键路径。
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm -F @gocell/web dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
