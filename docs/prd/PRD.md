# gocell-web · 前端 PRD（产品需求文档）

> 版本：**v1.0** · 起草日期：2026-05-23
> 仓库：`ghbvf/gocell-web`（本仓库，前端）
> 后端依赖：`ghbvf/gocell`（develop 分支）· 本地路径 `../gocell/`
> 设计依据：`docs/design/gocell/` 中的 6 份 chat + devboard 设计稿
> 后端需求清单：`docs/backend-requirements/`（BR-001 ~ BR-004）

## Changelog

### v1.1 — 2026-05-23
- §9 目录结构从单 app 扁平 `src/` 升级为 **pnpm workspace monorepo**（`apps/web/` + `packages/<cell>/` 平铺，scope `@gocell`，含 `@gocell/devboard` 容纳 Batch 5/6 内容）
- §11 未决项 5「前端架构原则（cell/slice 边界 → AI 并行隔离）」**已决**，单独成文 [parallel-ai-cell-mapping.md](../design/parallel-ai-cell-mapping.md)
- 跨包共享元素归属决策（PR #1 review 落地）：
  - auth store 放 `@gocell/access`（非 `apps/web`）
  - `<Can>` 拆两层：`@gocell/core` 提供 UI 壳 + 注入点，`@gocell/access` 提供 PDP client
  - Batch 5/6 内容（Cells/Groups/Coverage/Contracts/Deps）落 `@gocell/devboard`
- 边界强制机制补全：每包 `package.json#exports` 收口 + Batch 0 末期补 ESLint `no-restricted-imports`
- codegen CI 校验：`tools/codegen/` 落根目录，CI 跑 `pnpm codegen && git diff --exit-code` 保证 `packages/contracts/src/` 只读
- §10.1.1 新增 monorepo 结构验收项
- §12 估算：Batch 0 因 monorepo 骨架追加 1–2 人天（3d → 4–5d），MVP 总工作量 37 → 38–39 人天
- D1（类型生成）落地点从 `src/api/types/` 改为 `packages/contracts/src/`
- Feature Flag 实现路径从 `src/lib/flags.ts` 改为 `packages/config/src/composables/useFlag.ts`
- 设计 token 移植目标从 `src/styles/tokens.css` 改为 `packages/core/src/styles/tokens.css`

### v1.0 — 2026-05-23
- 注入 5 个决策（见 §0）
- 重构 Access 域：Users 单页扩展为 4 个子路由（Identities / Policies / Decisions / Reviews），路由表跟随调整
- MVP Batch 重排：原 Batch 2 拆为 Access Identities + Access Policies
- 引用 4 份 BR 文件（BR-001~004）；§8 后端依赖章节增加"对前端无负担的能力（后端已交付）"
- 工作量重估：Access 拆分新增约 2 人天

### v0.1 — 2026-05-23（初稿，已被 v1.0 替代）
- 13 路由 MVP，Users + RBAC 合一

---

## 0. 关键决策（v1.0 注入）

| # | 决策 | 决策理由 / 引用 |
|---|---|---|
| **D1** | **类型生成**：`json-schema-to-typescript` 从 `gocell/contracts/http/**/*.schema.json` 自动派生 `packages/contracts/src/`；CI 校验未手改 | 契约是后端单一真相，前端只读派生；演进零代价 |
| **D2** | **后端 assembly**：`corebundle`（accesscore + auditcore + configcore），public `:8080`、internal `127.0.0.1:9090` | 本地 `../gocell/Makefile` + `assemblies/corebundle/assembly.yaml` 确认 |
| **D3** | **可观测后端**：LGTM stack（Loki + Tempo + Prometheus + OTel Collector），dev 直连，prod 走 BFF 代理 | 详见 [BR-003](../backend-requirements/BR-003-observability-lgtm.md) |
| **D4** | **Access 域结构**：`/access/{identities, policies, decisions, reviews}` 4 个子路由；不把 RBAC 折叠到 Users 下 | 设计原则：identity / policy / decision 必须分离，撑住 RBAC → ABAC 演进。详见 [BR-004](../backend-requirements/BR-004-access-pdp-evolution.md) |
| **D5** | **Health overview 数据源**：依赖后端新增 2 个端点：`/api/v1/admin/health/cells` + `/api/v1/admin/system` | 详见 [BR-001](../backend-requirements/BR-001-health-cells.md) + [BR-002](../backend-requirements/BR-002-system-info.md) |

---

## 1. 背景

GoCell 是一个 Go 框架，按 **Cell（域单元）/ Slice（PR 级最小单元）/ Contract（跨 Cell 通信契约）/ Journey（端到端验收）** 组织代码。本项目是它的官方 Web 控制台——同时承担两个角色：

- **运维门户（Operate）**：管理用户/权限、查看审计、调整配置/Feature Flag、观察 Cell 运行状态。
- **开发者平台（DevBoard）**：项目级看板、AI 沙盒、依赖与契约浏览，未来打通"观察→定位→修复→防回归"闭环。

设计稿（claude.ai/design 导出）已在 `docs/design/gocell/` 落地：21 个 devboard 路由 + 1 个独立 first-run setup 向导，主风格为 **V1 Linear**（极简、单一 accent、高密度、明暗双主题）。

---

## 2. 目标与非目标

### 2.1 目标
- **G1 · 可用闭环**：MVP 上线后，运维角色能用一套统一界面完成"首次部署 → 登录 → 用户/权限管理 → 审计/配置/Flag 操作"；开发者能浏览 Cell 拓扑、契约与治理报告。
- **G2 · 设计一致性**：100% 复用 `tokens.css` 定义的色板/字体/圆角/阴影；所有页面遵循 V1 Linear 设计 DNA（线条而非块面、单一 accent、Serif H1 + Sans 正文 + Mono 元数据、高密度信息）。
- **G3 · 后端零阻塞**：MVP 全部页面直接对接 `ghbvf/gocell` 真实 API（本地 Docker 启），不依赖额外 BFF。
- **G4 · 可演进**：架构（路由分组、组件库、状态管理）能平滑承接后续 Wave 的 Plan/Build/Reserved 三组设计页。

### 2.2 非目标（首期不做）
- **手机/平板适配**：桌面优先，断点 `1280px+`。
- **Plan 组（Products/Backlog/Inbox/Board/Sprint）的实际数据**：MVP 仅保留路由占位 + 静态稿展示。
- **Build 组的 AI/Sandbox 真实联调**：AI Studio、Sandboxes 是设计概念，需要单独的 AI 后端。
- **Reserved 组（Billing/Secrets）**：等后端 cell 落地后再补 UI；MVP 仅保留 `preview` 状态占位。
- **国际化的全量翻译覆盖**：MVP 框架就位，业务文案先中文，待 i18n 抽取脚本到位再批量翻英文。

---

## 3. 技术栈

| 维度 | 选型 | 理由 |
|---|---|---|
| 框架 | **Vue 3.x（Composition API + `<script setup>`）** | 设计稿默认目标栈；团队熟悉；上一版 gocell-web 同栈。 |
| 语言 | **TypeScript（strict）** | 契约驱动后台，类型化收益高。 |
| 构建 | **Vite 5** | 启动快、HMR 稳；Vue 官方推荐。 |
| UI 库 | **Ant Design Vue 4.x** | 设计稿明确按 antd 组件映射（`a-table`、`a-modal`、`a-drawer`、`a-menu`、`a-form` 等）。需要少量样式覆盖以贴合 V1 Linear。 |
| 路由 | **Vue Router 4**（history mode） | 标准选择，无 hash。 |
| 状态 | **Pinia** | 官方推荐；分模块：`auth` / `theme` / `cells` / `audit` 等。 |
| HTTP | **Axios**（带拦截器） | 统一注入 `Authorization: Bearer <token>`、错误处理、refresh token 自动续约。 |
| i18n | **vue-i18n 9** | 中英文双语，默认中文。 |
| 图标 | **@ant-design/icons-vue** + 少量自定义 SVG（来自 dev-shell.jsx） | 设计稿用了自定义 24×24 stroke icons，作为 antd 默认 icon 的补充。 |
| 测试 | **Vitest** + **@vue/test-utils** + **Playwright**（E2E 首屏冒烟） | Vue 生态首选；E2E 仅冒烟。 |
| 代码规范 | **ESLint** + **Prettier** + **husky + lint-staged** | 强制 commit 前过 lint。 |

> **设计 token 移植**：直接把 `docs/design/gocell/project/tokens.css` 复制到 `packages/core/src/styles/tokens.css`，作为全局变量入口；`v1-linear.css` / `v1-deep.css` 拆解为 SCSS 模块。Ant Design Vue 通过 ConfigProvider 的 `theme.token` 注入对应的 oklch 颜色。

---

## 4. 设计系统（来自 chat3 Style Guide）

| 维度 | 规则 |
|---|---|
| 字体 | Geist（UI）+ Geist Mono（ID/数字/kbd）+ Instrument Serif（H1） |
| 主色 | Accent: `oklch(0.58 0.19 268)`，单一蓝紫，只用在主按钮/链接/焦点/进度条 |
| 中性 | 冷调灰阶（oklch 270 hue），细线 + 极轻阴影构建层级 |
| 圆角 | 4 / 6 / 10 / 14 px 四档 |
| 数字基线 | btn 30px · row 44px · sidebar 232px · top 44px · pad 24–28px · 字号 13–13.5px |
| 主题 | `[data-theme="dark"]` 切换，已在 tokens.css 中完整定义 |
| 状态色 | `--ok` 绿 / `--warn` 橙 / `--err` 红 |
| 反模式 | 多 accent、彩色 chip 满天飞、大圆角（>14px）、emoji、渐变背景、阴影分块 |

---

## 5. 信息架构

### 5.1 路由结构（v1.0 — 25 路由）

```
/                            → Health Overview（landing）
/login                       → 登录页（首次部署引导跳 first-run）
/first-run-setup             → 首次运行 admin 引导向导（5 步）

# 后台 Layout（侧边栏 + 顶栏 + 主内容）

# Meta（1）
/coverage                    gocell-web ↔ devboard 覆盖矩阵

# Plan（5）
/products                    Products（design-only）
/backlog                     Backlog（design-only）
/inbox                       Inbox（design-only）
/board                       Board（design-only）
/sprint                      Sprint（design-only）

# Build（7）
/workflow                    Workflows（design-only）
/dag                         Task DAG（design-only）
/ai                          AI Studio（design-only）
/sandboxes                   Sandboxes 列表（design-only）
/sandboxes/:id               Sandbox detail（design-only）
/deps                        Dependencies（MVP 静态）
/contracts                   Contract registry（MVP 静态）

# Access（4 子路由）★ v1.0 重构
/access/identities           主体管理（users / service accounts / cells as principals）
/access/policies             授权规则集
  └── ?tab=roles               MVP：RBAC 视图（roles + role-perm 矩阵）
  └── ?tab=rules               Wave 3：ABAC 条件规则编辑器（disabled in MVP）
  └── ?tab=templates           Wave 4：策略模板（disabled in MVP）
/access/decisions            PDP 决策日志（Wave 2 实数据；MVP 占位 "Coming in Wave 2"）
/access/reviews              访问审查（Wave 4 实数据；MVP 不出现在侧栏）

# Operate（5）— Users 域已移至 Access 顶级
/audit                       Audit log
/config                      Configuration
/flags                       Feature flags
/cells                       Cells 列表
/cells/:id                   Cell detail（10 tabs）
/groups                      Smart Groups（preview）

# Reserved（3）
/observe                     Observability（依赖 BR-003 落地）
/billing                     Billing（preview，placeholder 页）
/secrets                     Secrets vault（preview，placeholder 页）
```

### 5.1.1 侧栏分组（NAV_GROUPS，v1.0）

```
Meta:    Coverage
Plan:    Products · Backlog · Inbox · Board · Sprint
Build:   Workflows · Task DAG · AI Studio · Sandboxes · Dependencies · Contracts
Access:  Identities · Policies · Decisions · Reviews         ← 新顶级分组
Operate: Audit log · Configuration · Feature flags · Cells · Smart Groups
Reserved:Observability · Billing · Secrets vault
```

### 5.2 全局快捷键（来自 chat1）

| 键 | 行为 |
|---|---|
| ⌘K / Ctrl+K | 全局命令面板 |
| ⌘J / Ctrl+J | 切换明暗主题 |
| ⌘\\ / Ctrl+\\ | 折叠/展开侧边栏 |
| / | 聚焦页面搜索框 |
| G then U/A/C/F/S | 跳转 Users/Audit/Config/Flags/Settings |
| Esc | 关闭抽屉/模态/全屏 |

### 5.3 全局 Shell 组件

- **Sidebar (232px)**：品牌区 → `⌘K` 搜索 → 5 组导航（每组带 group label）→ 用户卡片（贴底）。每个 nav item 可挂状态 pill：`live` / `preview` / `new` / `reserved`。
- **TopBar (44px)**：面包屑 `gocell / {group} / {page}` + 右侧主题/Cmd-K 按钮。
- **AI BottomBar（设计稿要求，MVP 占位）**：底部三段式 32px/320px/全屏的 AI Shell，先做最小化条 + click-to-dock 的占位，AI 接入留后期。

---

## 6. MVP 范围（首期交付，v1.0）

MVP 共 **14 个路由 + 全局 Shell**，按依赖关系分 7 个交付批次。每个批次完成即可上线、不阻塞下一批。

> **MVP 路由明细**：`/` · `/login` · `/first-run-setup` · `/coverage` · `/access/identities` · `/access/policies` · `/audit` · `/config` · `/flags` · `/cells` · `/cells/:id` · `/groups` · `/contracts` · `/deps`。
> Plan 组（Products/Backlog/Inbox/Board/Sprint）、Build 组的 Workflows/DAG/AI/Sandboxes 不在 MVP；`/access/decisions`、`/access/reviews` 以 placeholder 出现；`/observe` 等 BR-003 落地后再开。

### Batch 0 · 基建（前置）
- **monorepo 骨架**（v1.1 新增）：根 `package.json` + `pnpm-workspace.yaml`（catalog 钉死所有第三方版本）+ `tsconfig.base.json`；`apps/web` + 9 个空包（core/shared/contracts/request/access/audit/config/observability/devboard）；每包 `package.json#exports` 收口
- 项目脚手架：Vite 5 + Vue 3 + TS strict + Pinia + Router 4 + Axios + AntD Vue 4 + vue-i18n 9 + ESLint + Prettier（版本全部走 catalog）
- `packages/core/src/styles/`：tokens.css、v1-linear.scss（从 `docs/design/gocell/project/v1-linear.css` 拆解）
- 全局 Layout 组件：Sidebar、TopBar、CommandPalette（壳）、AppShell 放在 `packages/core/src/ui/`
- 主题切换（light/dark），i18n 框架（zh-CN/en-US 框架就位，业务文案逐 batch 补）
- HTTP 客户端：Axios 实例 + 401 自动跳登录 + refresh token 拦截器 + 统一错误码 → i18n 映射，放在 `packages/request/src/`
- 认证状态：Pinia `auth` store（user、token、PDP 决策缓存）放在 `packages/access/src/stores/`（v1.1 决策）
- 路由守卫：未登录跳 `/login`；首次部署跳 `/first-run-setup`；`<Can>` UI 壳 + `useDecision()` 注入点放 `@gocell/core`，PDP client 放 `@gocell/access`（v1.1 决策；依赖 BR-004 §4.1）
- **类型生成 toolchain**（D1）：根目录 `tools/codegen/` 跑 `json2ts` 输出 `packages/contracts/src/`；`pnpm codegen` 命令；CI 跑 `pnpm codegen && git diff --exit-code packages/contracts/src/` 校验未手改
- **边界 lint**（Batch 0 末期）：补 `eslint-plugin-import` `no-restricted-imports` / `import/no-internal-modules` 规则作为双保险

### Batch 1 · 认证入口（最高优先级）

| 页面 | 后端 slice / 接口 |
|---|---|
| **First-run setup**（5 步：Preflight → Two planes → Operator → Admin → Submit → Done） | `GET /api/v1/access/setup/status`（前置检查）<br>`POST /api/v1/access/setup/admin`（Basic Auth + body 两层身份） |
| **Login**（用户名+密码 → TokenPair） | `POST /api/v1/access/sessions/login`<br>`POST /api/v1/access/sessions/refresh`<br>`DELETE /api/v1/access/sessions/...` |

设计稿：`first-run-setup.jsx`（753 lines）+ `LoginPage.vue`（参考上一版 gocell-web）。

### Batch 2 · Access · Identities ★ v1.0 拆分

| 页面 | 后端 |
|---|---|
| **/access/identities**（list / create / edit / lock / unlock / change-password） | `http.auth.user.*`（list/create/get/update/patch/delete/lock/unlock/change-password 9 个契约）；slice：`accesscore/identitymanage` |

MVP 阶段只支持 `type=user`；service-account / cell-as-principal 留 UI 占位（disabled tab "Service accounts"）。

### Batch 3 · Access · Policies ★ v1.0 拆分

| 页面 | 后端 |
|---|---|
| **/access/policies?tab=roles**（roles 列表 + role-perm 矩阵 + role assignment） | `http.auth.role.list.v1` / `role.check.v1` / `role.assign.v1` / `role.revoke.v1`；slice：`rbaccheck` + `rbacassign` |
| **/access/policies?tab=rules**（disabled） | 显示 "Coming in Wave 3 · ABAC" 占位卡 |
| **/access/policies?tab=templates**（disabled） | 显示 "Coming in Wave 4" 占位卡 |

`/access/decisions` 路由保留但不出现在侧栏，访问显示 "Coming in Wave 2 · depends on BR-004 §4.3"。

**前端权限组件**：`<Can action="..." resource="...">` 内部调 `POST /api/v1/access/decide`（BR-004 §4.1）。

### Batch 4 · Operate · Audit / Config / Flags

| 页面 | 后端 |
|---|---|
| **/audit**（hash chain 验证、按 day 分组、actor 类型 pill、quick filters） | `auditcore/auditquery` |
| **/config**（list + edit modal，stage/publish 流程，版本化） | `configcore/configread`、`configwrite`、`configpublish`、`rollback` |
| **/flags**（bool/variant、rollout %、kill switch） | `configcore/featureflag`、`flagwrite`、`flag.evaluate.v1` |

设计稿：`dev-audit.jsx`（347 lines）；config/flags 用上一版 gocell-web 的 ConfigList/FeatureFlag 页样式 + V1 Linear chrome。

### Batch 5 · Operate · Cells（核心差异化页面）

| 页面 | 后端 |
|---|---|
| **/cells**（list） | 静态生成（从 `../gocell/cells/*/cell.yaml` 派生 manifest 或新增 `GET /api/v1/admin/cells` 端点） |
| **/cells/:id**（10 tabs：Overview / Inventory / Interfaces / Wiring / Contracts / Dependencies / Tasks / Configuration / Audit / Slices / Groups / AI） | 识别信息从 cell.yaml；Interfaces/Wiring 静态；Audit、Configuration 复用对应 tab 的真实数据 |

设计稿：`dev-cell.jsx`（1485 lines）+ `dev-cell2.jsx`（587 lines）+ `dev-cell3.jsx`（323 lines）。**MVP 最复杂的页面**，约占总工作量的 25%。

### Batch 6 · DevTools / Build · 只读浏览

| 页面 | 数据源 |
|---|---|
| **/contracts**（contract registry，typed response envelope，governance gates CH-01..CH-06） | 静态 + 接 `gocell validate --strict` 输出 |
| **/deps**（goda 风格 explorer，4 视图：list / graph / tree / matrix） | 静态生成（`go mod graph` 数据） |
| **/coverage**（meta 页，展示 gocell-web ↔ devboard 实施进度） | 内嵌静态数据 |
| **/groups**（Smart Groups，preview 级，UI 框架 + 静态规则） | 无后端，纯前端 demo |

### Batch 7 · Landing & Observability v1

| 页面 | 后端 / 数据源 |
|---|---|
| **/**（Health overview）：cells 健康卡 + 系统信息 + 最近部署 + KPI 占位 | **BR-001** + **BR-002**（必做） |
| **/observe**（v1 简版：Overview / Logs / Traces 三 tab） | **BR-003**（LGTM stack） |

Wave 2 才上的 Observability tab（Anomalies / What changed / Service graph / Slice health）显示 disabled。

---

## 7. 后续 Wave（简述，不展开）

| Wave | 内容 | 触发条件 |
|---|---|---|
| **Wave 2 · Observability v2** | 完整 6 tab：Anomalies / What changed / Service graph / Slice health；contract 粒度 SLO；suspect-slice 自动 blame | 后端 OTel 后端选型完成 |
| **Wave 3 · Plan 组** | Products / Backlog / Inbox / Board / Sprint —— 项目管理面，需要后端落 Journey/Issue/Task 模型 | 后端 PM 数据模型设计完成（参考 `ado-gocell-mapping.md`） |
| **Wave 4 · Build · AI** | AI Studio 多轮对话、Sandboxes 生命周期、AI 自循环开发 | AI Agent 后端就绪 |
| **Wave 5 · Smart Groups + Reserved** | Smart Groups query builder、Billing、Secrets vault | 对应后端 cell 完成 |
| **Wave 6 · 跨页 pivot chain** | "Open in Traces / Open AI sandbox" 等真打通；postmortem 自动草稿 | Wave 2 + Wave 4 完成 |

---

## 8. 后端依赖（与 ghbvf/gocell@develop 对齐）

### 8.0 后端**已交付**能力（前端零负担消费）

这部分能力后端已有，前端**直接调用，不再做一遍**：

| 后端能力 | 后端位置 | 前端如何用 |
|---|---|---|
| **API 类型 spec** | `gocell/contracts/http/**/*.schema.json` | `tools/codegen/` 跑 `json2ts` 派生 `packages/contracts/src/`（**只读，CI 校验**） |
| **JWT auth (RS256)** | `accesscore` + `runtime/auth` | Axios 拦截器统一处理 token / refresh / 401 |
| **错误码 envelope** | `pkg/errcode` + `shared/errors/error-response-v1.schema.json` | 一张 `i18n/errors/*.ts` 码表，所有错误从 `error.code` 查文案 |
| **权限决策（PDP）** | `accesscore/authorizationdecide`（待 BR-004 §4.1 暴露 HTTP） | `<Can>` 组件 + `can()` 函数；**不在路由 meta 硬编 role** |
| **审计落盘** | `auditcore` 自动消费 outbox | 前端**不写 audit**，敏感操作通过后端 contract 自动记录 |
| **Feature Flag** | `configcore/featureflag` | `packages/config/src/composables/useFlag.ts` 拉缓存；UI 用 `v-if="isEnabled('flag-id')"`；**不在前端硬编 flag 名** |

### 8.1 现有 Cell / Slice 清单（来自本地 `../gocell/cells/`）
- **accesscore**：authorizationdecide · configreceive · identitymanage · rbacassign · rbaccheck · sessionlogin · sessionlogout · sessionrefresh · sessionvalidate · setup
- **auditcore**：auditappendconfig · auditappendrole · auditappendsession · auditappenduser · auditquery
- **configcore**：configpublish · configread · configreadinternal · configsubscribe · configwrite · featureflag · flagwrite

### 8.2 HTTP 契约清单（来自 `../gocell/contracts/http/`，共 33 个）

#### auth (18 个，归属 accesscore)
- `POST /api/v1/access/setup/admin` — 首次部署创建 admin（**Basic Auth 操作员凭据 + body 业务凭据**两层身份；admin 创建成功后永久 410 Gone）
- `GET /api/v1/access/setup/status` — 查询 first-run 是否已完成（公开）
- `POST /api/v1/access/sessions/login` — 登录（公开，返回 TokenPair RS256）
- `POST /api/v1/access/sessions/refresh` — 刷新 token
- `DELETE /api/v1/access/sessions/...` — 登出
- `POST/GET/PATCH/PUT/DELETE /api/v1/access/users/...` — 用户 CRUD（create/get/update/patch/delete/lock/unlock/change-password）
- `POST/GET/DELETE /api/v1/access/roles/...` — 角色管理（list/check/assign/revoke）

#### config (12 个，归属 configcore)
- `GET/POST/PUT/DELETE /api/v1/config/entries/...` — 配置 CRUD（list/get/write/update/delete）
- `POST /api/v1/config/publish` — 发布（stage→published）
- `POST /api/v1/config/rollback` — 回滚
- `GET /api/v1/config/internal/...` — 内部读（cell-to-cell）
- `GET/POST/PUT/DELETE /api/v1/config/flags/...` — Feature Flag 全套（list/get/create/update/delete/toggle/evaluate）

#### audit (1 个，归属 auditcore)
- `GET /api/v1/audit/...` — 审计日志查询（list，支持 filter）

#### 命名空间映射
| URL prefix | Cell | 前端页面 |
|---|---|---|
| `/api/v1/access/*` | accesscore | Login / First-run / Users / RBAC |
| `/api/v1/audit/*` | auditcore | Audit log |
| `/api/v1/config/*` | configcore | Configuration / Feature flags |

### 8.2.1 需后端新增的端点（→ 详见 docs/backend-requirements/）

| 端点 | BR | 阻塞 | 估算 |
|---|---|---|---|
| `GET /api/v1/admin/health/cells` | [BR-001](../backend-requirements/BR-001-health-cells.md) | MVP Batch 7（Health overview） | 1–2 人天 |
| `GET /api/v1/admin/system` | [BR-002](../backend-requirements/BR-002-system-info.md) | MVP Batch 7 | 0.5 人天 |
| `POST /api/v1/access/decide` | [BR-004](../backend-requirements/BR-004-access-pdp-evolution.md) §4.1 | MVP Batch 3（Access · Policies 的 `<Can>` 组件） | 0.5 人天 |
| LGTM stack 接入 + OTLP wiring | [BR-003](../backend-requirements/BR-003-observability-lgtm.md) | MVP Batch 7（Observability v1） | 3–5 人天 |

后续 Wave 涉及的端点（BR-004 §4.3 / §4.4 决策日志 + 批量决策）见对应 BR 文档。

### 8.3 关键约束（来自 chat5 develop 分支差分）
- **Cell 接口 ISP 拆分**：UI 端 Cell 视图需要展示四个子接口（Identity/Lifecycle/Status/Inventory）
- **Typed response envelope**（PR #403）：所有 HTTP 契约的 4xx/5xx 是 typed struct，错误结构统一为 `shared/errors/error-response-v1.schema.json`，前端可以做一个全局错误码 → i18n 文案的映射
- **DurabilityMode 强制声明**：Cell 列表/详情需要显示 `Demo` / `Durable` 徽章
- **JWT RS256**：登录返回 TokenPair（access + refresh），前端要处理 401 自动 refresh
- **Bootstrap Admin 边界**：setup 接口 401 时不区分"无凭据 / 错凭据 / 用户被锁"，全部统一返回 `ERR_AUTH_LOGIN_FAILED`（oracle-safe，防账号枚举）；前端登录页文案要避免暗示"用户存在但密码错"

### 8.4 跑后端的本地方式（来自本地 `../gocell/Makefile` + `docker-compose.yml`）
1. **起基础设施**（项目根目录的 docker-compose 只起 postgres/redis/rabbitmq/minio，**不含 gocell 服务本身**）：
   ```bash
   cd ../gocell && docker compose up -d
   ```
2. **配置 env**（参考 `../gocell/.env.example` 和 `docs/ops/first-run-setup.md`）：必须设置
   - `GOCELL_JWT_PRIVATE_KEY` / `GOCELL_JWT_PUBLIC_KEY`（RSA 2048）
   - `GOCELL_JWT_ISSUER` / `GOCELL_JWT_AUDIENCE`
   - `GOCELL_BOOTSTRAP_ADMIN_USERNAME` / `GOCELL_BOOTSTRAP_ADMIN_PASSWORD`（持久 operator 凭据）
3. **起 gocell**（example/corebundle，需后端方确认是哪个 assembly）：
   ```bash
   make build && ./bin/corebundle
   # 或 go run ./examples/<assembly>
   ```
   服务起在 `:8080`（默认，需确认）
4. **前端**：`.env.development` 配 `VITE_API_BASE=http://localhost:8080`，Vite `server.proxy` 转发 `/api/*` 避开 CORS。

---

## 9. 目录结构

> v1.1（2026-05-23）：从单 app 扁平结构升级为 **pnpm workspace monorepo**。详见 [parallel-ai-cell-mapping.md](../design/parallel-ai-cell-mapping.md)。

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
│   │ ── 基础设施层
│   ├── core/                               # @gocell/core           tokens + UI 原子 + theme/i18n composables（不兜底业务）
│   ├── shared/                             # @gocell/shared         utils / constants / types
│   ├── contracts/                          # @gocell/contracts      后端 schema → ts 派生（D1 落地点）
│   ├── request/                            # @gocell/request        axios 实例 + 拦截器
│   │
│   │ ── 业务能力层（对齐后端 cells/*）
│   ├── access/                             # @gocell/access         ← cells/accesscore（含 auth store + PDP client）
│   ├── audit/                              # @gocell/audit          ← cells/auditcore
│   ├── config/                             # @gocell/config         ← cells/configcore
│   ├── observability/                      # @gocell/observability  ← BR-003 LGTM
│   └── devboard/                           # @gocell/devboard       Cells / Groups / Coverage / Contracts / Deps（Batch 5/6）
│
├── tools/
│   └── codegen/                            # 根目录，json2ts 从 ../gocell/contracts/ 派生 packages/contracts/src/
│
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

**业务 package 内部统一约定**：

```
packages/access/
├── package.json                            # name: @gocell/access
├── tsconfig.json
└── src/
    ├── api/                                # 调 backend HTTP；import @gocell/contracts、@gocell/request
    ├── components/                         # 业务组件
    ├── composables/                        # 业务 hooks
    ├── stores/                             # 包内 Pinia store
    ├── routes.ts                           # 路由声明（由 apps/web/router 聚合）
    └── index.ts                            # ★ 唯一对外导出口
```

**隔离机制**：
- 物理：git worktree（沿用后端约定 `<num>-<short-slug>`，无 issue 时序号自增）
- 跨包入口：每包 `package.json#exports` 收口到 `./src/index.ts`，阻止外部深路径 import
- 包依赖：`package.json#dependencies` + pnpm `workspace:*`（等价后端 `slice.yaml#contractUsages`）
- 边界双保险：ESLint `no-restricted-imports` / `import/no-internal-modules`（Batch 0 末期补）
- 类型契约：`@gocell/contracts` schema 派生，CI 跑 `pnpm codegen && git diff --exit-code` 保证只读
- 版本一致：`pnpm-workspace.yaml#catalog:` 段钉死 Vue / Pinia / AntD Vue 等版本，业务包用 `"catalog:"` 引用

详细决策记录、AI 并行工作流、落地清单见 [parallel-ai-cell-mapping.md](../design/parallel-ai-cell-mapping.md)。

---

## 10. 验收标准

### 10.1 MVP 验收（Batch 0-7 完成）
- [ ] 全部 14 个 MVP 路由可访问、无空白页、无 console 错误
- [ ] 明暗主题切换实时生效，无 FOUC
- [ ] 中英文切换实时生效（业务文案 80% 中文优先，UI 框架文案双语）
- [ ] 全局快捷键 ⌘K / ⌘J / ⌘\\ / Esc 工作
- [ ] 登录态过期能自动 refresh token；refresh 失败踢回 `/login`
- [ ] 首次部署能从 `/first-run-setup` 走到 `/` 全流程
- [ ] 视觉与设计稿的"V1 Linear"风格 95%+ 一致（line-first / 单 accent / Serif H1 / Mono ID）
- [ ] Lighthouse Desktop Performance 评分 ≥ 85
- [ ] 单元测试覆盖率 ≥ 50%（每包独立 vitest，根 `pnpm -r test` 汇总；重点：auth flow、HTTP 拦截器、theme/i18n store）

### 10.1.1 Monorepo 结构验收（v1.1 新增）
- [ ] `pnpm install` 一次性成功；`pnpm -F @gocell/web dev` 启动空白页无错误
- [ ] `pnpm -r build` 全绿
- [ ] `pnpm codegen && git diff --exit-code packages/contracts/src/` 无 diff（即 contracts 未手改）
- [ ] ESLint 边界规则跑通：无跨包深路径 import 违规
- [ ] `pnpm-workspace.yaml#catalog:` 钉死的版本在所有业务 `package.json` 中以 `"catalog:"` 字符串引用（无硬编码版本号）

### 10.2 非验收项（明确不在 MVP 评估范围内）
- AI Studio、Sandboxes 的真实功能（仅 UI 壳）
- Plan 组各页的真实数据（仅静态稿）
- 端到端 trace pivot / blast radius / postmortem 等高级 observability 能力

---

## 11. 风险与未决事项

### 已在 v1.0 解决的问题（D1–D5）
全部 5 项前期决策已落地，见 §0 表格。

### 仍未决（不阻塞 MVP）

| 项 | 状态 | 备注 |
|---|---|---|
| Journey 数据放 `/cells` 还是独立 `/journeys` | **Wave 3 决** | MVP 不涉及。本地 `../gocell/journeys/` 有数据，可作为静态展示 |
| 设计稿中部分页面（Sandboxes detail / Workflows）依赖 AI 后端 | **延期** | 留到 Wave 4 |
| Coverage 矩阵的"数据真相"如何同步 | **待定** | 现在是手写硬编码，理想是 CI 自动生成（扫 router.ts + 后端 manifest） |
| Cells 列表数据源 | **待定** | 静态从 `../gocell/cells/*/cell.yaml` 派生，还是后端新加 `GET /api/v1/admin/cells`？MVP 先用静态 |
| 前端架构原则（cell/slice 边界 → AI 并行隔离） | **已决（v1.1）** | 采用 pnpm workspace monorepo：`apps/web/` + `packages/<cell>/` 平铺，scope `@gocell`。详见 [parallel-ai-cell-mapping.md](../design/parallel-ai-cell-mapping.md) |

---

## 12. 估算

| 维度 | 数值 | 说明 |
|---|---|---|
| MVP 路由数 | 14 | 含 1 个 multi-tab Cell detail；Access 拆 4 个子路由（MVP 实现 2 个，2 个 placeholder） |
| MVP 工作量（人天） | 约 **38–39 人天**（1 名熟练 Vue 工程师） | Batch 0 (4–5d，v1.1 含 monorepo 骨架 + catalog + exports + codegen CI hook，+1~2d) + Batch 1 (4d) + Batch 2 (3d, Identities) + Batch 3 (3d, Policies + `<Can>` 组件) + Batch 4 (5d) + Batch 5 (10d) + Batch 6 (6d) + Batch 7 (3d) |
| 后端配套工作量 | 5–8 人天 | BR-001 (1–2d) + BR-002 (0.5d) + BR-003 (3–5d) + BR-004 §4.1+§4.2 (1d) |
| 设计稿源代码量 | 26k+ 行 JSX/CSS | 移植成 Vue 时大部分逻辑可保留，CSS 80% 可复用 |
| 后端联调 | Batch 1/2/3/4/7 必须 |  |

---

## 13. 参考资料

### 内部文档
- **设计源稿**：`docs/design/gocell/`（README + 6 份 chat + project/）
- **后端需求清单**：`docs/backend-requirements/`
  - [BR-001](../backend-requirements/BR-001-health-cells.md) 聚合 cell 健康端点
  - [BR-002](../backend-requirements/BR-002-system-info.md) 系统元信息端点
  - [BR-003](../backend-requirements/BR-003-observability-lgtm.md) LGTM 可观测栈接入
  - [BR-004](../backend-requirements/BR-004-access-pdp-evolution.md) Access 子系统 RBAC → ABAC 演进
- **设计 Style Guide**：`docs/design/gocell/project/gocell style guide.html`（v1）
- **ADO ↔ GoCell 概念映射**：`docs/design/gocell/project/uploads/ado-gocell-mapping.md`
- **Coverage 矩阵真相源**：`docs/design/gocell/project/dev-coverage.jsx`

### 外部
- 后端仓库：https://github.com/ghbvf/gocell（develop 分支）
- 本地后端路径：`../gocell/`

---

_本 PRD 由 Claude 基于设计稿 + 与用户多轮对话整理。v1.0 锁定 MVP 范围；v1.1 关闭架构原则未决项，目录结构升级为 pnpm workspace monorepo（详见 [parallel-ai-cell-mapping.md](../design/parallel-ai-cell-mapping.md)）。_
