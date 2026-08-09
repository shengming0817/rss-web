# 并行 AI 实施 · 前端 Cell 映射方案

> 版本：**v1.0** · 起草日期：2026-05-23
> 仓库：`ghbvf/gocell-web`
> 关闭：PRD §11 未决项「前端架构原则（cell/slice 边界 → AI 并行隔离）」
> 替换：PRD §9 目录结构

---

## 0. TL;DR

把 gocell-web 从单 app 扁平结构升级为 **pnpm workspace monorepo**：

- `apps/web/` —— 主应用（路由聚合 + 装配层）
- `packages/<cell>/` —— 每个业务包对齐后端一个 cell（前端短名 = 后端 cell 名去掉 `core` 后缀）
- `packages/{core, shared, contracts, request}` —— 基础设施层
- `tools/codegen/` —— 根目录工具链，从后端 schema 派生 `packages/contracts/src/`

**物理隔离**走 git worktree；**逻辑隔离**走 pnpm `workspace:*` + 每包唯一 `src/index.ts` 导出口 + `package.json#exports` 收口。这套组合等价于后端 Cell/Slice/Contract 的边界约束。

### 起步命令（quickstart）

```bash
pnpm install
pnpm codegen                          # 从 ../gocell/contracts/ 派生 ts 类型
pnpm -F @gocell/web dev               # 启动 dev server
pnpm -r test                          # 跑所有 package 的 vitest
pnpm -F @gocell/web build             # 生产构建（Vite 直消费 workspace 源码，单 bundle）
```

---

## 1. 背景

PRD §0 已锁定 5 项决策（D1–D5），但 §11 留了一项未决：

> 前端架构原则（cell/slice 边界 → AI 并行隔离） · **沟通中**
> 用户对"照搬 gocell 目录"提出质疑，需另起讨论：前端原生的隔离机制（chunk / TS project refs / 自动注册）。本 PRD 不锁定，待对齐后单独成文。

本文档关闭这一项。

### 1.1 核心诉求

让多个 AI agent 能在同一仓库上**并行实施不同业务模块**，互不破坏。具体需求：

1. **物理隔离**：每个 agent 在独立 worktree 工作，文件改动不串
2. **逻辑隔离**：A agent 改 access 时，不能误碰 audit 的私有实现
3. **契约边界**：跨业务交互必须显式声明（PR diff 能看出来）
4. **对齐后端**：前端业务模块名 = 后端 cell 名，issue 跨前后端复用

### 1.2 调研结论（要点）

| 选项 | 结论 |
|---|---|
| Feature-Sliced Design (FSD) | Vue 圈非主流，头部项目 0 个使用；React 圈热 |
| 单 app + 扁平 `src/{api,store,views}/` | Vue 圈主流（Vben/JeecgBoot/Pure Admin 都是），但 AI 并行时容易冲突 |
| **pnpm workspace + 平铺 packages**（本方案） | **Vue 圈头部项目主流**（Vben 31.8k star 同此结构）；天然提供包级隔离 |

详见 §9 决策记录。

---

## 2. 目标与非目标

### 2.1 目标
- **G1** 多 AI agent 并行时，业务包之间不能误改对方私有 src/
- **G2** 跨包依赖必须在 `package.json` 显式声明，PR diff 一眼可见
- **G3** 前端业务包短名语义对齐后端 cell 名（`@gocell/access` ← `cells/accesscore`，去掉 `core` 后缀）
- **G4** 对 PRD §3 锁定的全表技术栈（Vue 3 + Vite + TS + Pinia + Vue Router + AntD Vue + Axios + vue-i18n + Vitest + Playwright + ESLint）零冲突

### 2.2 非目标
- 不做微前端（module federation）
- 不强制 FSD 的 layer/slice/segment 三轴术语
- 不引入 Nx（pnpm workspace 已够用）

---

## 3. 设计原则

从后端 Cell/Slice/Contract 模型抽取的不变量：

| 后端原则 | 前端映射 |
|---|---|
| Cell 是域单元，有 `owner` + `schema.primary` 边界 | 一个 package 对应一个 cell，`package.json#name` 是唯一标识 |
| Slice 用 `belongsToCell` 声明归属 | 包内 `src/` 默认私有，不允许跨包深路径 import |
| Slice 用 `contractUsages` 声明依赖 | 跨包依赖必须在 `package.json#dependencies` 显式列出 |
| Slice 用 `allowedFiles: cells/X/slices/Y/**` 锁修改范围 | git worktree + 包目录隔离 = 修改范围天然受限 |
| Contract 用 `ownerCell` + `endpoints.clients` 白名单 | 包的 `src/index.ts` 是唯一导出口 + `package.json#exports` 收口；不导出 = 私有 |
| archtest 跨边界 import 检测 | `package.json#exports` 阻深路径 import + pnpm `workspace:*` 阻未声明依赖 + ESLint `no-restricted-imports`（在 Batch 0 末期补） |

### 3.1 命名映射规则

| 后端 | 前端短名 | 说明 |
|---|---|---|
| `cells/accesscore` | `@gocell/access` | 去掉 `core` 后缀 |
| `cells/auditcore` | `@gocell/audit` | 同上 |
| `cells/configcore` | `@gocell/config` | 同上 |
| `cells/internal/*` | （无前端镜像） | 后端私有 cell |
| BR-003 LGTM | `@gocell/observability` | 不对应后端 cell，纯前端壳 |

引用后端时保留全名（`accesscore`、`auditcore`）；引用前端时用短名（`@gocell/access`）。跨仓库 grep 时两者都能命中（前端文档总用短名 + 后端注释）。

### 3.2 跨包共享元素归属

| 元素 | 归属决策 | 理由 |
|---|---|---|
| **`<Can>` 权限组件** | **拆两层**：`@gocell/core` 提供 UI 壳 + `useDecision()` 注入点；`@gocell/access` 提供 PDP client；`apps/web` 启动期注入 | 业务包不需反向依赖 access；基础设施层不直接触碰业务 API |
| **`auth` store**（token / refresh / PDP 决策缓存） | **`@gocell/access`** | auth flow（login/refresh/PDP）就是 access 域；`apps/web` 仅 provide/inject，不持状态 |
| **`theme` / `i18n` store** | **`apps/web/src/stores/`** | 跨业务通用的应用级状态 |
| **Cells/Groups/Coverage/Contracts/Deps**（PRD Batch 5/6） | **新建 `@gocell/devboard`** | 开发者平台域；`@gocell/core` 保持纯基础设施（tokens/UI 原子），不兜底 |

---

## 4. 目标骨架

```
gocell-web/
│
├── apps/
│   └── web/                                # @gocell/web        主应用
│       └── src/
│           ├── main.ts
│           ├── App.vue
│           ├── router/                     # 聚合各 package 导出的 routes
│           ├── stores/                     # 应用级 store：auth / theme / i18n
│           ├── layouts/                    # AppShell / AuthShell
│           ├── views/                      # 薄页面壳（主体在 packages/*）
│           └── styles/                     # 全局 SCSS 入口
│
├── packages/                               # 平铺
│   │
│   │ ── 基础设施层
│   ├── core/                               # @gocell/core           tokens + UI 原子 + theme/i18n composables（不兜底业务）
│   ├── shared/                             # @gocell/shared         utils / constants / types
│   ├── contracts/                          # @gocell/contracts      后端 schema → ts 派生（PRD D1）
│   ├── request/                            # @gocell/request        axios 实例 + 拦截器
│   │
│   │ ── 业务能力层（对齐后端 cells/*）
│   ├── access/                             # @gocell/access         ← cells/accesscore（含 auth store + PDP client）
│   ├── audit/                              # @gocell/audit          ← cells/auditcore
│   ├── config/                             # @gocell/config         ← cells/configcore
│   ├── observability/                      # @gocell/observability  ← BR-003 LGTM（无后端 cell 镜像）
│   └── devboard/                           # @gocell/devboard       ← Cells/Groups/Coverage/Contracts/Deps（PRD Batch 5/6）
│
├── tools/
│   └── codegen/                            # 根目录工具链，json2ts 从 ../gocell/contracts/ 派生 packages/contracts/src/
│
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

### 4.1 业务 package 内部约定

所有 `packages/<cell>/` 统一遵循：

```
packages/access/
├── package.json                            # name: @gocell/access
├── tsconfig.json
└── src/
    ├── api/                                # 调 backend HTTP；import @gocell/contracts、@gocell/request
    ├── components/                         # 业务组件（IdentityList、PolicyForm…）
    ├── composables/                        # useIdentities、usePolicies
    ├── stores/                             # 包内 Pinia store
    ├── routes.ts                           # 路由声明（由 apps/web/router 聚合）
    └── index.ts                            # ★ 唯一对外导出口
```

**关键约束**：包外只能 `import { x } from '@gocell/access'`，不允许 `import { x } from '@gocell/access/src/stores/foo'`。强制手段见 §5.1 `exports` 字段。

### 4.2 tsconfig 形态

走 **单一 `tsconfig.base.json` + paths 别名**（Vue/Vben 主流），不用 project references：

```jsonc
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "paths": {
      "@gocell/*": ["./packages/*/src"]
    }
  }
}
```

包内 `tsconfig.json` `extends` base，无需 `references[]`。IDE 跳转走 pnpm 软链 + paths 都能直达源码，**不预编译 dist**。

---

## 5. 跨包依赖规则

### 5.1 依赖声明 + 单出口收口

```json
// packages/access/package.json
{
  "name": "@gocell/access",
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "dependencies": {
    "@gocell/contracts": "workspace:*",
    "@gocell/core": "workspace:*",
    "@gocell/request": "workspace:*",
    "@gocell/shared": "workspace:*",
    "vue": "catalog:",
    "pinia": "catalog:"
  }
}
```

**两道闸门**：
1. `exports` 字段把外部可访问路径收口到 `./src/index.ts`，深路径 `import '@gocell/access/src/stores/foo'` 在 Vite/TS 都解析失败
2. `dependencies` 显式声明，`@gocell/access` 不能 `import` `@gocell/audit`（不在 deps = pnpm 不软链）

第三方依赖（vue / pinia / antd-vue 等）用 `"catalog:"` 字符串，版本从根 `pnpm-workspace.yaml#catalog:` 取，确保全仓一致。

### 5.2 跨业务包通信（极少数情况）

如果 `access` 真的需要 `audit` 的能力，**两条路**：

1. **下沉**：把共用部分移到 `@gocell/shared`，两边都引
2. **显式依赖**：在 `access/package.json#dependencies` 加 `@gocell/audit`，PR 中显式可见，由审查者判断是否合理

不允许的：用相对路径 `../../audit/src/...` 绕开（pnpm + tsconfig 都不解析）。

### 5.3 装配层依赖

```json
// apps/web/package.json
{
  "name": "@gocell/web",
  "dependencies": {
    "@gocell/access": "workspace:*",
    "@gocell/audit": "workspace:*",
    "@gocell/config": "workspace:*",
    "@gocell/observability": "workspace:*",
    "@gocell/core": "workspace:*",
    "@gocell/contracts": "workspace:*",
    "@gocell/request": "workspace:*",
    "@gocell/shared": "workspace:*"
  }
}
```

---

## 6. 隔离机制总览

| 层 | 机制 | 工具 | 等价于后端 |
|---|---|---|---|
| 物理 | git worktree | git | git worktree |
| 跨包入口 | `package.json#exports` 收口到 `./src/index.ts` | Vite / TS / Node 解析器 | Contract 的 `ownerCell` + `endpoints.clients` 白名单 |
| 包依赖声明 | `package.json#dependencies` + pnpm `workspace:*` | pnpm | `slice.yaml#contractUsages` |
| 边界双保险 | ESLint `no-restricted-imports` / `import/no-internal-modules` | ESLint（Batch 0 末期补） | archtest type-aware |
| 类型契约 | `@gocell/contracts` schema 派生 + CI 校验只读 | `tools/codegen/` + 见 §6.1 | `contracts/http/**/*.schema.json` |
| 版本一致 | `pnpm-workspace.yaml#catalog:` 段，业务包用 `"catalog:"` 引用 | pnpm catalog 协议 | go.mod |

### 6.1 codegen CI 校验机制（关闭 PRD D1 "CI 校验未手改" 留白）

`@gocell/contracts/src/` 是派生产物，开发者不应手改。校验三步：

```bash
# CI 步骤
pnpm codegen                                            # tools/codegen/ 重新生成
git diff --exit-code packages/contracts/src/            # 任何 diff 即拒 PR
```

落地点：
- `tools/codegen/` 独立工具不入 pnpm workspace，根 `package.json` 加 `"codegen": "node tools/codegen/index.js"` 脚本
- CI workflow 在 install 后立即跑上面两行，失败即 fail
- `packages/contracts/` 在 README 顶部标注 "DO NOT EDIT — Generated by `pnpm codegen`"

---

## 7. AI 并行工作流

### 7.1 worktree 命名约定（沿用后端）

格式：`<num>-<short-slug>`，其中：
- 接入 GitHub Issue 后：`<issue-num>-<slug>`，如 `101-access-identities-pagination`
- 未接入 issue 系统时：`<seq>-<slug>`，扫 `worktrees/` + `git branch -a` 取最大 +1（与后端 ship skill 一致）
- 纯文档 / 重构 / hotfix 可用 `<type>/<slug>` 风格（如本仓首个 PR `docs/cell-monorepo`）

例：
- `101-access-identities-pagination` → 改 `packages/access/`
- `102-audit-export-csv` → 改 `packages/audit/`
- `103-config-feature-flag-cache` → 改 `packages/config/`

### 7.2 一次并行实施示例

| Agent | worktree | 业务包 | PR 涉及目录 |
|---|---|---|---|
| A | `101-access-identities-pagination` | `@gocell/access` | `packages/access/**` |
| B | `102-audit-export-csv` | `@gocell/audit` | `packages/audit/**` |
| C | `103-config-flag-cache` | `@gocell/config` | `packages/config/**` |

三个 agent 同时跑，**git 层无冲突**（不同目录），**包层无串改**（pnpm 解析阻止）。

### 7.3 并行注意事项（已知串行点）

| 文件 / 操作 | 串行性 | 处置 |
|---|---|---|
| `pnpm-lock.yaml` | 全仓单点 | 若 PR 修改根 lockfile（新加 / 升级 npm 依赖），合并前 sync develop |
| `apps/web/src/router/index.ts` | 装配层 | 每加 cell 都要改一行 import；建议批次内只允许 1 个 PR 改装配层（或 follow-up 切 `import.meta.glob` 自动扫，见 R5 backlog） |
| `pnpm-workspace.yaml#catalog:` | 全仓单点 | 版本升级单独开 PR，禁与业务 PR 同批 |
| `tools/codegen/` 重跑产物 | 派生 | 业务 PR 不应包含 `packages/contracts/src/` diff（除非后端 schema 真的改了） |

并发 `pnpm install`：每 worktree 独立 `node_modules`，但 pnpm 全局 store（`~/.local/share/pnpm/store`）共享。建议串行 install 或使用 `--frozen-lockfile` 模式。

### 7.4 PR 审查要点

- diff 是否只动了自己业务包目录？跨包改动需说明
- `package.json#dependencies` 是否新增了业务包依赖？需评审合理性
- `src/index.ts` 是否新导出了之前私有的符号？需评审是否过度暴露
- 是否触及上方任何「串行点」？若是，确认有同步策略

---

## 8. 路由聚合方式

### 8.1 包内声明

```ts
// packages/access/src/routes.ts
import type { RouteRecordRaw } from 'vue-router';

export const accessRoutes: RouteRecordRaw[] = [
  { path: '/access/identities', component: () => import('./components/IdentitiesPage.vue') },
  { path: '/access/policies',   component: () => import('./components/PoliciesPage.vue') },
  // ...
];
```

### 8.2 装配层聚合

```ts
// apps/web/src/router/index.ts
import { accessRoutes } from '@gocell/access';
import { auditRoutes } from '@gocell/audit';
import { configRoutes } from '@gocell/config';

const routes = [
  ...accessRoutes,
  ...auditRoutes,
  ...configRoutes,
];
```

不走 file-based 自动注册（避免隐式约定）；显式聚合便于审查路由总表。

---

## 9. 关键决策记录

### D-A · 为什么 pnpm workspace 而非 Nx
pnpm 自带 `workspace:*` 协议，无需额外工具；Nx 提供的 ESLint 边界规则用包名解析已经能替代。Vben Admin（Vue 圈最高 star）同选择。

### D-B · 为什么平铺 packages 而非 `packages/cells/<x>` 分组
Vue 圈头部项目（vuejs/core、Pinia、Nuxt、Vben）全部平铺。子目录分组（Vben 用过 `packages/effects/`）是 Vben 自创术语，主流不用。

### D-C · 为什么单 app 仍保留 `apps/web/` 层
未来要加 storybook、e2e、移动端壳都能进 `apps/`，避免后期重构。Vben 单 app 模板也走 `apps/` 层。

### D-D · 为什么 scope 用 `@gocell`
- 后端不发 npm 包，scope 无冲突
- 同 org 表达"GoCell 产品族"统一性
- Vue 圈惯例（@vben、@nuxt、@element-plus）

### D-E · 业务 store 放在每个包内
集中 stores（如 Vben）破坏包自治。store 是业务实现细节，应随业务包走。**auth store** 放 `@gocell/access`（auth flow 本质是 access 域）；**theme / i18n** 这种纯应用级状态留 `apps/web/src/stores/`。

### D-F · 为什么类型派生放 `@gocell/contracts` 而非 `apps/web/src/api/types/`
所有业务包都要引契约类型；若放 app，业务包反向依赖 app，违反方向。`@gocell/contracts` 作为根基础设施包，被所有业务包 import。

### D-G · `<Can>` 权限组件拆两层
- `@gocell/core` 提供 `<Can>` UI 壳 + `useDecision()` 注入点（无业务逻辑）
- `@gocell/access` 提供具体 PDP client + auth store
- `apps/web` 启动期把 access 的 client 注入 core 的 useDecision

这样 audit/config/observability 用 `<Can>` 时只引 `@gocell/core`，**不需要反向依赖 `@gocell/access`**，分层方向不被打破。

### D-H · Cells/Groups/Coverage/Contracts/Deps 落新建 `@gocell/devboard`
PRD Batch 5/6 的"开发者平台"功能（Cells 列表 / Smart Groups / Coverage 矩阵 / Contracts 浏览 / Deps 拓扑）集中到 `@gocell/devboard`。`@gocell/core` **不兜底业务**，永远保持纯基础设施（tokens / UI 原子 / theme / i18n composables）。

---

## 10. 与 PRD 的关系

| PRD 章节 | 本文档关系 |
|---|---|
| §0 D1（类型生成） | 类型派生目标改为 `packages/contracts/src/`（替换原 `src/api/types/`），CI 校验机制见本文档 §6.1 |
| §3 技术栈 | 完全兼容，无修改 |
| §6 Batch 5/6（落 core 或新包） | 明确落 `@gocell/devboard`（本文档 §3.2 + D-H） |
| §9 目录结构 | **被本方案完整替换** |
| §10 验收标准 | 需补 monorepo 验收项（pnpm 构建全绿 / 无跨包深路径 import / catalog 引用生效） |
| §11 未决项 5（前端架构原则） | **本文档关闭** |

---

## 11. 落地清单

> 不在本 PRD 锁定的 MVP 范围内强制实施；建议在 Batch 0（基建）阶段一次性搭起骨架。

### Phase 1 · 骨架搭建（Batch 0 内，硬前置：catalog 必须先做）
- [ ] 根 `package.json` + `pnpm-workspace.yaml`（含 `catalog:` 段钉死 Vue / Pinia / Vue Router / AntD Vue / Vite / Axios / vue-i18n / Vitest / Playwright 版本）
- [ ] 根 `tsconfig.base.json`（paths: `"@gocell/*": ["./packages/*/src"]`）
- [ ] `apps/web/` 空 app（main.ts + App.vue + router 空聚合）
- [ ] `packages/{core, shared, contracts, request}` 空骨架（含 `package.json#exports` + 空 `src/index.ts`）
- [ ] `packages/{access, audit, config, observability, devboard}` 空骨架
- [ ] 每包 `package.json` 第三方依赖一律 `"catalog:"` 引用
- [ ] `tools/codegen/` 根目录脚手架 + 根 `package.json` 的 `"codegen"` 脚本
- [ ] 验证：`pnpm install` 成功；`pnpm -F @gocell/web dev` 启动空白页

### Phase 2 · 基础设施迁移（Batch 0 后期，前置：Phase 1）
- [ ] **先**：`tools/codegen/` 接通，跑 `pnpm codegen` 输出到 `packages/contracts/src/`
- [ ] **再**：CI hook：`pnpm codegen && git diff --exit-code packages/contracts/src/`
- [ ] tokens.css / SCSS 移到 `packages/core/src/styles/`
- [ ] AppShell / Sidebar / TopBar / CommandPalette 移到 `packages/core/src/ui/`
- [ ] `<Can>` UI 壳 + `useDecision()` 注入点放 `packages/core/src/`
- [ ] axios 封装 + 错误码 → i18n 映射移到 `packages/request/src/`
- [ ] 每包 `vitest.config.ts`，根 `pnpm -r test` 汇总
- [ ] Batch 0 末期补 ESLint 边界规则（`eslint-plugin-import` `no-restricted-imports`）

### Phase 3 · 业务包按 Batch 填充
- Batch 1 → `@gocell/access`（first-run-setup + login + auth store + PDP client）
- Batch 2 → `@gocell/access`（identities）
- Batch 3 → `@gocell/access`（policies + `<Can>` 的 access 侧注入）
- Batch 4 → `@gocell/audit` + `@gocell/config`（含 `useFlag()` composable）
- Batch 5 → `@gocell/devboard`（Cells / Smart Groups / Health Overview）
- Batch 6 → `@gocell/devboard`（Contracts / Deps）
- Batch 7 → `@gocell/observability`

### Phase 4 · backlog（规模 / 场景触发再做）
- catalog 版本升级 SOP（第一次升 Vue/Pinia/AntD 大版本时定）
- 增量构建工具 turborepo（包数 > 12 或 CI 全量 > 5 min）
- 新 cell 脚手架 `pnpm create gocell-cell`（第 3 个新 cell 之后）
- 多 worktree 并发 `pnpm install` 互斥（出现 lock 冲突时）
- `.npmrc` `hoist-pattern=` 严格化防 phantom dependency（出现违规 import 时）
- 路由聚合换 `import.meta.glob` 自动扫（装配层成为高频冲突点时）

---

## 12. 参考资料

### 外部
- [Vue Vben Admin](https://github.com/vbenjs/vue-vben-admin) —— Vue 圈最高 star 的 pnpm workspace 实践
- [pnpm Workspace 文档](https://pnpm.io/workspaces)
- [pnpm Catalog 协议](https://pnpm.io/catalogs)

### 内部
- 后端 Cell/Slice/Contract 模型：`../gocell/CLAUDE.md` + `../gocell/.claude/rules/gocell/ai-robust.md`
- 后端 cell 示例：`../gocell/cells/accesscore/cell.yaml`
- 后端 slice 示例：`../gocell/cells/configcore/slices/configread/slice.yaml`
- PRD：`docs/prd/PRD.md`
