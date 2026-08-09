# gocell-web · 协作说明

> 后端框架 `ghbvf/gocell` 的官方 Web 控制台。本文是 AI / 人协作的实施细则；与 PRD / 设计稿 / BR 冲突时以后三者为准。

## 真相源（修改前必读）

| 类型 | 路径 |
|---|---|
| **PRD** | `docs/prd/PRD.md`（v1.1，25 路由、7 个 MVP Batch） |
| **设计稿** | `docs/design/gocell/`（chat1–6 + project/）—— 风格、组件、token、页面级 jsx 参考 |
| **架构原则** | `docs/design/parallel-ai-cell-mapping.md`（包结构 + 边界 + 命名映射） |
| **后端需求** | `docs/backend-requirements/BR-001..BR-004.md`（向后端提的需求清单） |
| **后端代码** | `../gocell/`（本地路径；契约 schema 在 `../gocell/contracts/`） |

## 工作方式

- 修改前先 `Read` 目标文件 + `Grep` 已有实现；不重复读 PRD 已写明的内容
- 提交信息遵循 Conventional Commits（`feat:`/`fix:`/`refactor:`/`docs:`/`chore:`/`test:`）
- 行为或公开 API 变更要同步更新 PRD / BR / cell 内 README
- 被 `.gitignore` 忽略的文件禁止 `git add -f`
- review 与重构不考虑向后兼容——前端没有外部消费者
- backlog 走 GitHub Issues；新 issue 必须带 `priority/p0..p3` + 至少一个 `batch/<N>` 或 `pkg/<name>` 标签

## 架构约束

### 仓库结构

```
apps/web/                 — 主应用：路由聚合 + 全局 Layout + 装配层
packages/
  core/                   — 设计系统：tokens.css / 全局 Layout / Composables / UI 壳（无业务）
  shared/                 — 跨包工具函数（无业务、无 store、无 UI）
  contracts/              — 由 codegen 从后端 *.schema.json 派生的 TS 类型（只读）
  request/                — Axios 实例 + 拦截器 + 错误码 → i18n 映射
  access/                 — 镜像后端 cells/accesscore（auth store / PDP client / Identities / Policies）
  audit/                  — 镜像后端 cells/auditcore
  config/                 — 镜像后端 cells/configcore（config + feature flag）
  observability/          — 前端壳（对应 BR-003 LGTM 接入；后端无对应 cell）
  devboard/               — Cells/Groups/Coverage/Contracts/Deps（Batch 5/6）
tools/codegen/            — 根目录工具：从 ../gocell/contracts/ 派生 packages/contracts/src/
docs/                     — PRD / 设计稿 / BR / ADR
worktrees/                — git worktree 工作区（用完即删）
```

包短名规则：`cells/<X>core` → `@gocell/<X>`（去 `core` 后缀）。详见 `docs/design/parallel-ai-cell-mapping.md` §3.1。

### 依赖规则（Hard，由 lint / exports 强制）

- `@gocell/contracts` 由 `tools/codegen` 生成，**业务包不得手改**；CI 跑 `pnpm codegen && git diff --exit-code packages/contracts/src/` 守门
- `@gocell/core` 只依赖 `@gocell/shared`，**不依赖任何业务 cell**
- `@gocell/shared` 不依赖其他 `@gocell/*` 包
- `@gocell/access|audit|config|observability|devboard` 之间**不直接 import**——跨域只允许通过 `@gocell/contracts` 的类型 + `@gocell/request` 的 client
- **`<Can>` / PDP 归属（PRD §9/§211 两层拆分）**：`<Can>` 组件 + `useDecision()` 注入点（`PDP_INJECTION_KEY`）唯一归属 `@gocell/core`（UI 壳，全包经 exports 消费）；PDP client 实现（`createPdpClient`）唯一归属 `@gocell/access`，由 `apps/web` 装配层经注入点 `provide` 注入。**设计性例外**：`@gocell/devboard` 可依赖 `@gocell/access`（消费其 PDP client 能力），因为 devboard 所有页面都依赖 PDP；其他业务包之间无横向 import 例外。`<Can>`/`useDecision` 本身来自 `@gocell/core`，与其他消费方一致
- `apps/web` 可依赖所有 `@gocell/*` 包；反向不允许
- 跨包 import 只走 `package.json#exports` 暴露的入口，**禁止深路径** `@gocell/foo/src/internal/x`

### Cell / Slice 规则

- 每个 `packages/<cell>/` 必须有：
  - `README.md`：cell 域定义、对应后端 cell、对外 `exports` 清单、依赖的 contract 列表
  - `package.json#exports`：唯一收口，未列出的路径外部不可访问
  - `src/index.ts`：唯一根导出
- Slice 粒度 = PR 粒度：一个 PR 改一个 slice（一组紧密相关的文件，不跨 cell）；跨 cell 的工作拆多 PR

## 前端编码规范

- Vue 3 SFC，全部 `<script setup lang="ts">`，Composition API；不写 Options API
- 状态管理 Pinia，每个 cell 一个 store 模块；store 文件命名 `useXxxStore`
- HTTP 调用走 `@gocell/request`；不在组件里直接 `axios.create`
- 错误处理走后端 envelope（`error.code` → i18n key），不在 catch 里写中文字面量
- 样式只用 `tokens.css` 暴露的 CSS 变量（`--accent` / `--ok` / `--warn` / `--err` / 中性灰阶 / 圆角 / 字号），**禁止 inline color 和魔法数字**
- 设计 DNA 见 PRD §4：单一 accent / 细线 + 极轻阴影 / 圆角 4·6·10·14 / Geist + Geist Mono + Instrument Serif；反模式（多 accent / 彩色 chip 满天飞 / emoji / 渐变）一律拒绝
- i18n key 用点分层级 `<cell>.<page>.<element>`；零硬编中英文
- a11y：交互元素必须可键盘聚焦，对话框/抽屉守 ARIA role；颜色对比度 ≥ WCAG AA
- TypeScript `strict: true`；禁用 `any`（极少数边界场景用 `unknown` + 类型守卫）

## 测试规范

- 新增 / 修改代码 vitest 单测覆盖率 ≥ **80%**；`@gocell/core` ≥ **90%**
- Playwright 仅做关键路径冒烟（login / first-run / health overview / cells list）；不追求页面级 E2E 覆盖
- 单测用 `@vue/test-utils` + jsdom；Pinia store 测试用 `createTestingPinia`
- 组件测试聚焦行为（事件、props、emits、slots），不快照测样式

## 修改代码前的流程

1. **读**：`Read` 目标文件 + 关联 contract（`packages/contracts/src/<...>`）+ 对应 PRD 段落
2. **查**：`Grep` 已有同类实现，复用而不是新增
3. **改完跑**：
   - 本包：`pnpm -F @gocell/<pkg> typecheck && pnpm -F @gocell/<pkg> test --run`
   - 跨包：`pnpm -w lint && pnpm -w typecheck`
4. **只改需要改的**——禁止顺手重构无关代码

## AI-robust 治理章程

主要实施者是 AI（Claude Code）。新增 / 修改约束 enforcement 机制（TS 类型系统 / `package.json#exports` / ESLint rule / 构建期断言 / 运行期 invariant）按 **AI-robust 三档**（Hard / Medium / Soft）评级；**Soft 严禁立项**。载体决策原则、盲区自检、并行 AI 隔离规则、review checklist 详见 `.claude/rules/gocellweb/ai-robust.md`。并行 AI 隔离的设计依据见 `docs/design/parallel-ai-cell-mapping.md` §3。

## 参考框架

新建或重构包内模块时，先用 `WebFetch` 读对标项目源码，commit message 注明 `ref: <project> <file>`。

| 模块 | 对标项目 |
|---|---|
| monorepo 结构 / 包边界 / catalog | `vbenjs/vue-vben-admin`（31.8k star，pnpm workspace 平铺） |
| 后台 Layout / 路由分组 / 命令面板 | Vercel Dashboard、Linear Console |
| Pinia store 组织 | Pinia 官方 examples、`pure-admin/vue-pure-admin` |
| Ant Design Vue 风格覆盖 | Ant Design Pro Vue（v3+） |
| 可观测前端 | Grafana OnCall console、Sentry React UI |
| codegen (json-schema → ts) | `bcherny/json-schema-to-typescript` |

详尽对标记录落 `docs/references/`（待 Batch 0 末建）。

## Sandbox 提权

以下命令需 `dangerouslyDisableSandbox: true`（走本地 / 远端网络）：

- `git push` / `git pull` / `git fetch` / `git clone`
- `gh *`（GitHub CLI 全家桶）
- `pnpm install` / `pnpm add` / `pnpm publish`（拉 / 推 registry）
- `docker *` / `docker compose *`
- 任何访问 `127.0.0.1:7897`（本地代理）的命令

只读 / 本地命令（`pnpm -F ... test`、`pnpm -w typecheck`、`pnpm -F ... build`、`vitest run`、`playwright test`）默认走沙箱。

## 文档命名规则

- ADR / 设计文档：`docs/<area>/<yyyyMMdd>-<编号>-<功能描述>.md`（编号在该目录内自增）
- BR：`docs/backend-requirements/BR-<NNN>-<topic>.md`（README 索引同步更新）
- 设计参考：`docs/references/<framework>-<topic>.md`

## 与后端项目协作

- 后端代码本地路径 `../gocell/`；契约 schema 在 `../gocell/contracts/`
- 前端 `pnpm codegen` 直接读 `../gocell/contracts/http/**/*.schema.json` 派生 `packages/contracts/src/`
- 后端能力不齐时**起 BR**（`docs/backend-requirements/BR-XXX-*.md`）+ 在 `ghbvf/gocell` 开 issue 标题 `[BR-XXX] <title>`；流程详见 `docs/backend-requirements/README.md`
- 修复后端 bug 不在本仓库做——在 `../gocell/` 走 `ship` 流程
