import { defineWorkspace } from 'vitest/config'

// vitest workspace — T023
// 聚合根级 + packages/*/vitest.config.ts + apps/*/vitest.config.ts + tools/*/vitest.config.ts
// 根级 `pnpm test`（=vitest run）跑全部项目。
export default defineWorkspace([
  'vitest.config.ts',
  'packages/*/vitest.config.ts',
  'apps/*/vitest.config.ts',
  'tools/*/vitest.config.ts',
])
