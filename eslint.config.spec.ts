/**
 * eslint.config.spec.ts — ESLint 边界锁反向自检（ai-robust Hard 前置举证）
 *
 * 目的：
 *  ① 合规代码 → 边界规则 0 个 error
 *  ② 违规代码 fixture → 被对应 ruleId 报错
 *
 * 边界锁方案：no-restricted-imports（匹配 import specifier 字符串）
 * 不依赖 resolver 物理路径解析，lintText + filePath 即可可靠测试。
 *
 * 盲区说明（见 eslint.config.js 顶部）：
 * - 运行时动态 import()、字符串拼接路径无法拦截
 * - re-export 转发盲区（A 从 B 导出 C import A 的内容不受约束）
 * - 相对路径跨包在 monorepo 实践中不可达
 */

import { describe, it, expect } from 'vitest'
import { ESLint } from 'eslint'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 以 worktree 根为基准构造 filePath，使用已存在的文件
// type-aware linting 需要文件在 tsconfig 的 include 中
function wt(...segments: string[]): string {
  return path.resolve(__dirname, ...segments)
}

// 单例复用：new ESLint() 会加载完整 flat config + 全部 plugin（数秒级），
// 每个用例新建会在 CI 慢机上超时（5s）。共享实例后仅首次 lintText 触发加载，
// 后续调用快；配合 root vitest.config 的 testTimeout 兜底首次加载耗时。
const sharedEslint = new ESLint({
  cwd: __dirname,
  overrideConfigFile: path.resolve(__dirname, 'eslint.config.js'),
})

async function lint(code: string, filePath: string): Promise<ESLint.LintResult[]> {
  return sharedEslint.lintText(code, { filePath })
}

/** 从 results 中取出所有 ruleId */
function ruleIds(results: ESLint.LintResult[]): string[] {
  return results.flatMap((r) => r.messages.map((m) => m.ruleId ?? ''))
}

/** 仅取边界相关 ruleId */
function boundaryRuleIds(results: ESLint.LintResult[]): string[] {
  // 注意：import-x/no-restricted-paths 已从 eslint.config.js 中废弃移除（替换为
  // no-restricted-imports regex 方案），此处不再过滤该废弃 ruleId。
  return ruleIds(results).filter(
    (id) => id === 'no-restricted-imports' || id === 'import-x/no-cycle',
  )
}

// ── 合规代码：0 个边界 error ────────────────────────────────────────────────

describe('ESLint 边界锁 — 合规代码（应 0 个 boundary error）', () => {
  it('access import core — 合规', async () => {
    const code = `import { useTheme } from '@gocell/core'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/access/src/index.ts'))
    expect(boundaryRuleIds(results)).toEqual([])
  })

  it('access import request — 合规', async () => {
    const code = `import { http } from '@gocell/request'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/access/src/index.ts'))
    expect(boundaryRuleIds(results)).toEqual([])
  })

  it('access import contracts — 合规', async () => {
    const code = `import type { } from '@gocell/contracts'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/access/src/index.ts'))
    expect(boundaryRuleIds(results)).toEqual([])
  })

  it('devboard import access (PDP 例外) — 合规', async () => {
    const code = `import { } from '@gocell/access'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/devboard/src/index.ts'))
    expect(boundaryRuleIds(results)).toEqual([])
  })

  it('request import axios (HTTP 单点例外) — 合规', async () => {
    const code = `import axios from 'axios'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/request/src/http.ts'))
    const axiosErrors = ruleIds(results).filter((id) => id === 'no-restricted-imports')
    expect(axiosErrors).toEqual([])
  })

  it('apps/web import @gocell/core — 合规', async () => {
    const code = `import { AppShell } from '@gocell/core'\nexport const x = 1\n`
    const results = await lint(code, wt('apps/web/src/App.vue'))
    expect(boundaryRuleIds(results)).toEqual([])
  })

  it('apps/web import @gocell/access — 合规', async () => {
    const code = `import { useAuthStore } from '@gocell/access'\nexport const x = 1\n`
    const results = await lint(code, wt('apps/web/src/App.vue'))
    expect(boundaryRuleIds(results)).toEqual([])
  })

  it('apps/web import @gocell/audit — 合规', async () => {
    const code = `import { } from '@gocell/audit'\nexport const x = 1\n`
    const results = await lint(code, wt('apps/web/src/App.vue'))
    expect(boundaryRuleIds(results)).toEqual([])
  })
})

// ── 违规代码：被对应 ruleId 报错 ────────────────────────────────────────────

describe('ESLint 边界锁 — 违规代码（必须被报错）', () => {
  // ── 深路径锁 ──────────────────────────────────────────────────────────────

  it('深路径 @gocell/core/src/x — no-restricted-imports 拦截', async () => {
    const code = `import { something } from '@gocell/core/src/internal/x'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/access/src/index.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  it('深路径 @gocell/shared/src/utils — no-restricted-imports 拦截', async () => {
    const code = `import { something } from '@gocell/shared/src/utils'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/access/src/index.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  it('apps/web 深路径 — no-restricted-imports 拦截', async () => {
    const code = `import { something } from '@gocell/core/src/stores/useThemeStore'\nexport const x = 1\n`
    const results = await lint(code, wt('apps/web/src/main.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  // ── 横向业务 cell 边界 ────────────────────────────────────────────────────

  it('access import @gocell/audit — 被拦', async () => {
    const code = `import { } from '@gocell/audit'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/access/src/index.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  it('access import @gocell/config — 被拦', async () => {
    const code = `import { } from '@gocell/config'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/access/src/index.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  it('access import @gocell/observability — 被拦', async () => {
    const code = `import { } from '@gocell/observability'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/access/src/index.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  it('access import @gocell/devboard — 被拦', async () => {
    const code = `import { } from '@gocell/devboard'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/access/src/index.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  it('core import @gocell/access — 被拦', async () => {
    const code = `import { } from '@gocell/access'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/core/src/index.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  it('core import @gocell/audit — 被拦', async () => {
    const code = `import { } from '@gocell/audit'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/core/src/index.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  it('devboard import @gocell/audit — 被拦（非 access 例外）', async () => {
    const code = `import { } from '@gocell/audit'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/devboard/src/index.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  it('devboard import @gocell/config — 被拦', async () => {
    const code = `import { } from '@gocell/config'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/devboard/src/index.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  it('devboard import @gocell/observability — 被拦', async () => {
    const code = `import { } from '@gocell/observability'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/devboard/src/index.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  // ── audit 包横向边界 ──────────────────────────────────────────────────────

  it('audit import @gocell/access — 被拦', async () => {
    const code = `import { } from '@gocell/access'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/audit/src/index.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  it('audit import @gocell/config — 被拦', async () => {
    const code = `import { } from '@gocell/config'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/audit/src/index.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  it('audit import @gocell/observability — 被拦', async () => {
    const code = `import { } from '@gocell/observability'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/audit/src/index.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  // ── config 包横向边界 ────────────────────────────────────────────────────

  it('config import @gocell/audit — 被拦', async () => {
    const code = `import { } from '@gocell/audit'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/config/src/index.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  it('config import @gocell/access — 被拦', async () => {
    const code = `import { } from '@gocell/access'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/config/src/index.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  it('config import @gocell/observability — 被拦', async () => {
    const code = `import { } from '@gocell/observability'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/config/src/index.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  // ── observability 包横向边界 ─────────────────────────────────────────────

  it('observability import @gocell/access — 被拦', async () => {
    const code = `import { } from '@gocell/access'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/observability/src/index.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  it('observability import @gocell/audit — 被拦', async () => {
    const code = `import { } from '@gocell/audit'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/observability/src/index.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  it('observability import @gocell/config — 被拦', async () => {
    const code = `import { } from '@gocell/config'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/observability/src/index.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  it('shared import @gocell/core — 被拦（shared 不依赖任何 @gocell/*）', async () => {
    const code = `import { } from '@gocell/core'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/shared/src/index.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  it('shared import @gocell/request — 被拦', async () => {
    const code = `import { } from '@gocell/request'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/shared/src/index.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  it('request import @gocell/core — 被拦（request 不依赖 core）', async () => {
    const code = `import { } from '@gocell/core'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/request/src/http.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  it('request import @gocell/access — 被拦', async () => {
    const code = `import { } from '@gocell/access'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/request/src/http.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  // ── 反向依赖: @gocell/web ────────────────────────────────────────────────

  it('packages/access import @gocell/web — 被拦（反向依赖）', async () => {
    const code = `import { } from '@gocell/web'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/access/src/index.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  it('packages/core import @gocell/web — 被拦', async () => {
    const code = `import { } from '@gocell/web'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/core/src/index.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  it('tools/codegen import @gocell/web — 被拦', async () => {
    const code = `import { } from '@gocell/web'\nexport const x = 1\n`
    const results = await lint(code, wt('tools/codegen/src/index.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  // ── tools 禁止 @gocell/* ──────────────────────────────────────────────────

  it('tools/codegen import @gocell/core — 被拦', async () => {
    const code = `import { something } from '@gocell/core'\nexport const x = 1\n`
    const results = await lint(code, wt('tools/codegen/src/index.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  it('tools/codegen import @gocell/contracts — 被拦', async () => {
    const code = `import { something } from '@gocell/contracts'\nexport const x = 1\n`
    const results = await lint(code, wt('tools/codegen/src/index.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  // ── axios 单点锁 ──────────────────────────────────────────────────────────

  it('业务包 access import axios — 被拦', async () => {
    const code = `import axios from 'axios'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/access/src/index.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })

  it('apps/web import axios — 被拦', async () => {
    const code = `import axios from 'axios'\nexport const x = 1\n`
    const results = await lint(code, wt('apps/web/src/main.ts'))
    expect(ruleIds(results)).toContain('no-restricted-imports')
  })
})

// ── 规则加载验证 ─────────────────────────────────────────────────────────────
describe('边界锁规则加载验证（配置 parse 成功）', () => {
  it('no-restricted-imports 规则本身已加载（合规代码无误报）', async () => {
    const code = `export const x = 1\n`
    const results = await lint(code, wt('packages/access/src/index.ts'))
    const ids = ruleIds(results).filter((id) => id === 'no-restricted-imports')
    expect(ids).toEqual([])
  })

  it('devboard import access 不被边界锁拦截（PDP 例外正确豁免）', async () => {
    const code = `import { useDecision } from '@gocell/access'\nexport const x = 1\n`
    const results = await lint(code, wt('packages/devboard/src/index.ts'))
    // 只检查 no-restricted-imports，其他规则不关心
    const boundaryErrors = ruleIds(results).filter((id) => id === 'no-restricted-imports')
    expect(boundaryErrors).toEqual([])
  })
})
