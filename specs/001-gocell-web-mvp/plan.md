# Implementation Plan: gocell-web MVP

**Branch**: `001-gocell-web-mvp` | **Date**: 2026-05-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-gocell-web-mvp/spec.md` · Research: [research.md](./research.md)

## Summary

实现 GoCell Web 控制台 MVP：pnpm workspace monorepo（`apps/web` + 9 个 `@gocell/*` 包），
14 个路由 + 全局 Shell，分 8 个批次（Batch 0–7）增量交付。技术路线由 ship 三 agent 探索确认：
pnpm catalog 钉版 + `exports` 收口 + ESLint 边界双锁（架构）；per-package Vitest + ≥50% 覆盖（测试）；
内存 access token + 单飞刷新 + oracle-safe + fail-closed PDP（安全）。契约类型由 `tools/codegen/`
从 `../gocell/contracts/` 单向派生，CI `git diff` 保证只读。

## Technical Context

**Language/Version**: TypeScript 5.x（strict）/ Vue 3.4（Composition API + `<script setup>`）
**Primary Dependencies**: Vite 5 · Ant Design Vue 4 · Vue Router 4 · Pinia · Axios · vue-i18n 9 · @ant-design/icons-vue
**Storage**: 无本地持久层；access token 内存（Pinia）、refresh 理想 httpOnly cookie（待后端确认，见 research §7.1）、theme/locale → localStorage
**Testing**: Vitest + @vue/test-utils（单测，每包独立，根 `pnpm -r test` 汇总）+ Playwright（首屏冒烟）
**Target Platform**: 现代桌面浏览器，断点 `1280px+`（不做移动端）
**Project Type**: Web 前端 SPA（pnpm workspace monorepo）
**Performance Goals**: Lighthouse Desktop Performance ≥ 85；主题/语言切换无 FOUC
**Constraints**: 100% 复用 V1 Linear tokens；直连真实后端无 BFF；contracts 只读派生；单测覆盖 ≥50%
**Scale/Scope**: 14 个 MVP 路由（含 1 个 10+ tab Cell detail）+ 全局 Shell；9 个业务/基础设施包；33 既有契约 + 4 BR 新增端点

**NEEDS CLARIFICATION（不阻塞 Batch 0–6）**：
- refresh token 是否由后端下发 httpOnly cookie（影响 7.1 存储策略）。
- `/cells` 数据源：静态派生 cell.yaml vs 新增 `GET /admin/cells`（MVP 取静态）。
- BR-001/002/003/004 端点交付时间（阻塞 Batch 3 的 `<Can>` 实数据、Batch 7）。

## Constitution Check

*GATE：Phase 0 前必过，Phase 1 后复检。依据 `.specify/memory/constitution.md` v1.0.0。*

| 原则 | 本计划如何满足 | 状态 |
|---|---|---|
| I. Package-Native 分层 | apps/web + 9 包平铺；依赖单向向下；contracts 叶子 | ✅ |
| II. Contract 单一真相 | tools/codegen 派生 + CI git diff 只读；error.code→i18n | ✅ |
| III. 包边界纪律 | index.ts 唯一出口 + exports 收口 + ESLint 双锁（Batch 0 末） | ✅ |
| IV. 测试先行 | per-package vitest，≥50%，TDD 测试先写清单（见各 Phase） | ✅ |
| V. 设计 DNA | tokens.css 100% 复用，AntD ConfigProvider 注入，反模式禁用 | ✅ |
| VI. 权限是 UX | `<Can>` 仅显隐，fail-closed，后端再校验 | ✅ |
| VII. 后端零阻塞 | 直连真实 API，占位页显式标记 | ✅ |
| VIII. 安全内建 | 内存 token + 单飞刷新 + oracle-safe + 守卫顺序 | ✅ |
| IX. 简约增量 | 按 batch 独立上线，不预设未来 Wave | ✅ |

**强制修正项（探索代码示例违宪，落地必改）**：
- ⚠️ `@gocell/request` MUST NOT 静态 import `@gocell/access`（违反原则 I）。改为 `setupAxios({ getToken, onRefresh, onAuthFail })` 依赖注入，由 `apps/web` 在启动时装配 auth store 回调。research §5/§7 已标注。

**初次门**：PASS（无未豁免违规）。**Phase 1 后复检**：PASS（结构未引入新违规）。

## Project Structure

### Documentation (this feature)

```text
specs/001-gocell-web-mvp/
├── plan.md              # 本文件
├── spec.md              # 需求规格
├── research.md          # Phase 0 探索汇总
├── data-model.md        # Phase 1 视图模型
├── quickstart.md        # Phase 1 本地起步
├── pr-breakdown.md      # PR 拆分（~2000 行/PR）
├── contracts/           # 前端消费的契约映射（指向 ../gocell/contracts）
└── tasks.md             # Phase 2（speckit-tasks 产出）
```

### Source Code (repository root)

```text
gocell-web/
├── pnpm-workspace.yaml          # packages: apps/** + packages/**；catalog: 钉死版本
├── tsconfig.base.json           # paths: @gocell/* → packages/*/src
├── package.json                 # 根 scripts: dev/build/test/lint/codegen
├── .eslintrc.* / .prettierrc    # 边界双锁规则
├── apps/
│   └── web/                     # @gocell/web 主应用
│       ├── vite.config.ts       # server.proxy /api → VITE_API_BASE
│       └── src/{main.ts,App.vue,router/,stores/,layouts/,views/,locales/,styles/}
├── packages/
│   ├── core/                    # tokens + UI 原子 + AppShell/Sidebar/TopBar/CommandPalette + <Can> UI 壳 + theme/i18n composables
│   ├── shared/                  # utils/constants/types（无 @gocell 依赖）
│   ├── contracts/               # ★ 生成只读（tools/codegen 产出）
│   ├── request/                 # axios 实例 + 拦截器 + setupAxios 装配点 + error-code 映射
│   ├── access/                  # auth store + PDP client(useDecision) + Identities/Policies 页 + routes.ts
│   ├── audit/                   # auditquery 页 + routes
│   ├── config/                  # config/flags 页 + useFlag + routes
│   ├── observability/           # BR-003 LGTM 页 + routes
│   └── devboard/                # Cells/Groups/Coverage/Contracts/Deps + routes
└── tools/
    └── codegen/                 # json2ts：../gocell/contracts/http/**/*.schema.json → packages/contracts/src/
```

每业务包内部：`src/{api,components,composables,stores,routes.ts,index.ts}`，`index.ts` 唯一出口。

## Architecture Decisions（来自 research.md）

1. **pnpm workspace（非 Nx）+ catalog + exports + paths**（research §1）。
2. **codegen 单向派生 + CI git diff 只读**（research §2）。
3. **ESLint 边界双锁**：`import/no-restricted-paths` zones + `import/no-internal-modules`（research §3）。
4. **AntD 主题三层桥**：tokens.css(oklch) → useThemeTokens → ConfigProvider `{algorithm, token, cssVar:true}`（research §4）。
5. **request 依赖注入装配**：`setupAxios` 回调，避免 request→access 反向依赖（research §5，强制项）。
6. **内存 access + 单飞刷新 + 静默 bootstrap + oracle-safe + fail-closed PDP + 守卫三段顺序**（research §7）。

## Phases

- **Phase 0（已完成）**：research.md — 三方向探索汇总 + 强制修正项 + 风险登记。
- **Phase 1（本计划产出）**：data-model.md（视图模型 + 契约映射）、quickstart.md（本地起步）、contracts/ 映射。
- **Phase 2（speckit-tasks）**：tasks.md — 按 batch 的依赖序任务 + TDD 测试先写清单 + [P] 并行标记。
- **实施（后续，本轮不写业务代码）**：按 pr-breakdown.md 逐 PR 落地，每 batch 末过验收清单。

### 批次依赖与并行

```
Batch 0 (基建/骨架) ──┬─→ Batch 1 (认证) ──┬─→ Batch 2 (Identities) ─┐
                      │                     ├─→ Batch 3 (Policies+Can)─┤
                      │                     │                          ├─→ 可并行
                      │                     └─→ Batch 4 (Audit/Config/Flags)
                      ├─────────────────────────→ Batch 5 (Cells)      │ (依赖 0，弱依赖 4 的 audit/config tab)
                      ├─────────────────────────→ Batch 6 (DevTools 只读，多静态) │ 仅依赖 0
                      └─────────────────────────→ Batch 7 (Landing/Observe) 依赖 0 + BR-001/002/003
```

- Batch 0 是硬前置（BLOCKS 全部）。
- Batch 2/3/4 都依赖 Batch 1 的 auth + request + `<Can>` 基础；彼此包隔离可并行（不同 `@gocell/*` 包）。
- Batch 5/6 仅依赖 Batch 0（数据多为静态/派生），可与 2/3/4 并行；Batch 5 的 Audit/Config tab 弱依赖 Batch 4。
- Batch 7 依赖后端 BR-001/002/003，时间上可能后置。
- 并行隔离手段：git worktree + 包边界，符合 parallel-ai-cell-mapping.md。

## Testing Strategy（概要，详见 research §6 + tasks.md TDD 清单）

- 每包独立 Vitest（jsdom + @vue/test-utils），根 `pnpm -r test` 汇总，v8 coverage ≥50%。
- 必测：单飞 401 刷新、auth store 生命周期、路由守卫三段、`<Can>` fail-closed、theme/i18n 无 FOUC、error-code→i18n 映射（table-driven `test.each`）。
- 契约形态 mock 复用 `@gocell/contracts` 派生类型（不手写形状）。
- Playwright 首屏冒烟：登录重定向 / shell 渲染 / 主题切换。

## Stop & Report

本计划在 Phase 1 完成后停止（不进入实施）。产出：spec.md / plan.md / research.md / data-model.md /
quickstart.md / contracts/ / 随后由 speckit-tasks 产 tasks.md，speckit-analyze 产一致性报告，
pr-breakdown.md 产 PR 拆分，最后录入 GitHub epic + 8 sub-issues。
