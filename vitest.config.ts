import { defineConfig } from 'vitest/config'

// Root-level vitest config: covers repo-root spec files (ESLint boundary self-check etc.)
export default defineConfig({
  test: {
    name: 'root',
    environment: 'node',
    // Explicitly include root-level spec files, bypassing default excludes
    include: ['*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // 边界自检每个用例跑 ESLint Node API（首次加载 config+plugin 数秒）；
    // CI 慢机下默认 5s 会超时，放宽到 30s。
    testTimeout: 30_000,
  },
})
