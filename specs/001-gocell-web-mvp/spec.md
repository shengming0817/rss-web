# Feature Specification: gocell-web MVP (Web Console)

**Feature Branch**: `001-gocell-web-mvp`
**Created**: 2026-05-29
**Status**: Draft
**Input**: PRD v1.1 (`docs/prd/PRD.md`) + design `docs/design/parallel-ai-cell-mapping.md` + BR-001..004
**Backend truth**: `ghbvf/gocell@develop` (local `../gocell/`)

## Overview / Context

gocell-web 是 GoCell（Go 框架，按 Cell/Slice/Contract/Journey 组织）的官方 Web 控制台，
承担两个角色：**运维门户（Operate）** 与 **开发者平台（DevBoard）**。MVP 交付 **14 个路由 + 全局 Shell**，
分 8 个批次（Batch 0–7），每批完成即可独立上线、不阻塞下一批。技术栈 Vue 3 + TS strict + Vite 5 +
Ant Design Vue 4 + Pinia + Vue Router 4 + Axios + vue-i18n 9，组织为 pnpm workspace monorepo
（`apps/web` + 9 个 `@gocell/*` 包）。视觉遵循 V1 Linear 设计 DNA，直连 `ghbvf/gocell` 真实 API。

## User Scenarios & Testing

> 用户故事按交付批次（Batch）= 优先级排列。每个 batch 独立可测、可上线、可演示，构成 PRD §6 的增量切片。
> P1 = 基建/认证闭环（无它则不可用）；后续递减。

### User Story 0 — Monorepo 骨架与基础设施 (Priority: P1) 🎯 基座

作为前端工程团队，我需要一个 pnpm workspace monorepo 骨架（apps/web + 9 包）、统一构建/lint/类型链、
设计 token、全局 Layout 壳、HTTP 客户端、认证状态容器、路由守卫、契约类型 codegen toolchain，
使得后续所有 batch 能在隔离的包内并行开发并通过边界 lint。

**Why this priority**: 一切的前置；没有骨架与 codegen/边界纪律，后续无法并行也无法保证质量。

**Independent Test**: `pnpm install` 一次成功；`pnpm -F @gocell/web dev` 起空白页无错误；
`pnpm -r build` 全绿；`pnpm codegen && git diff --exit-code packages/contracts/src/` 无 diff；
ESLint 边界规则跑通无跨包深路径违规；catalog 版本在所有 `package.json` 以 `"catalog:"` 引用。

**Acceptance Scenarios**:
1. **Given** 干净 checkout，**When** `pnpm install && pnpm -r build`，**Then** 全绿无错误。
2. **Given** 一个包 A 深路径 import 包 B 内部文件，**When** 跑 ESLint，**Then** 报 `no-restricted-imports`/`import/no-internal-modules` 违规。
3. **Given** 手改 `packages/contracts/src/`，**When** CI 跑 `pnpm codegen && git diff --exit-code`，**Then** 非零退出。
4. **Given** 主题切到 dark，**When** 刷新页面，**Then** 无 FOUC、token 颜色正确。

### User Story 1 — 认证入口（First-run + Login） (Priority: P1)

作为运维管理员，首次部署时我能走完 first-run setup 向导创建 admin，之后用用户名+密码登录拿到 TokenPair，
登录态过期自动 refresh，refresh 失败踢回登录页。

**Why this priority**: 没有登录就进不了任何后台页面，是闭环起点。

**Independent Test**: 全新后端 → `/first-run-setup` 5 步走到 `/`；已 setup → `/login` 登录进 `/`；
人为过期 access token → 自动 refresh 续期；refresh 失败 → 跳 `/login`。

**Acceptance Scenarios**:
1. **Given** 后端未 setup（`GET /setup/status` = pending），**When** 访问任意路由，**Then** 重定向到 `/first-run-setup`。
2. **Given** setup 完成（端点已 410 Gone），**When** 访问 `/first-run-setup`，**Then** 提示已完成并引导去 `/login`。
3. **Given** 错误的用户名或密码，**When** 提交登录，**Then** 显示统一 `ERR_AUTH_LOGIN_FAILED` 文案，**不暗示**账号是否存在。
4. **Given** access token 过期、refresh 有效，**When** 发起受保护请求，**Then** 拦截器单飞刷新后透明重放，用户无感。
5. **Given** refresh 也失效，**When** 发起请求，**Then** 清理状态并跳 `/login`。

### User Story 2 — Access · Identities (Priority: P2)

作为管理员，我能在 `/access/identities` 列表/创建/编辑/锁定/解锁/改密管理用户主体（MVP 仅 `type=user`）。

**Why this priority**: 用户管理是运维核心；依赖认证（US1）。

**Independent Test**: 登录后进 `/access/identities`，完成 list→create→edit→lock→unlock→change-password 全链路，
service-account / cell-as-principal tab 为 disabled 占位。

**Acceptance Scenarios**:
1. **Given** 已登录有权限，**When** 进入页面，**Then** 表格按 `http.auth.user.list` 渲染真实数据。
2. **Given** 创建用户表单，**When** 提交，**Then** 调 `user.create` 成功并刷新列表；校验/错误码映射到 i18n 文案。
3. **Given** 一个用户，**When** 点锁定/解锁/改密，**Then** 调对应契约并反映状态。
4. **Given** 无对应权限，**When** 渲染操作按钮，**Then** `<Can>` 隐藏/禁用（fail-closed）。

### User Story 3 — Access · Policies（RBAC + `<Can>`） (Priority: P2)

作为管理员，我能在 `/access/policies?tab=roles` 查看 roles、role-perm 矩阵、做 role assignment；
`tab=rules`/`tab=templates` 为 disabled 占位；`/access/decisions`、`/access/reviews` 为占位。

**Why this priority**: 权限模型是 Access 域闭环；提供全站 `<Can>` 组件，依赖 BR-004 §4.1 `POST /access/decide`。

**Independent Test**: roles 列表渲染、role-perm 矩阵显示、assign/revoke 生效；`<Can>` 在有/无权限下正确显隐；
PDP 网络失败时 fail-closed。

**Acceptance Scenarios**:
1. **Given** 进入 policies，**When** 默认 tab，**Then** 渲染 `role.list` + 权限矩阵。
2. **Given** assign/revoke 操作，**When** 提交，**Then** 调 `role.assign`/`role.revoke` 并刷新。
3. **Given** PDP `/decide` 超时/报错，**When** `<Can>` 评估，**Then** fail-closed（默认隐藏）。
4. **Given** 访问 `/access/decisions`，**When** 渲染，**Then** 显示 "Coming in Wave 2" 占位，路由不在侧栏。

### User Story 4 — Operate · Audit / Config / Flags (Priority: P2)

作为管理员，我能查审计日志（hash chain 验证、按 day 分组、actor pill、quick filter），
管理配置（list+edit、stage/publish、版本化、rollback），管理 Feature Flag（bool/variant、rollout%、kill switch）。

**Why this priority**: 运维三大日常面；依赖认证 + 错误/权限基础设施。

**Independent Test**: `/audit` 真实查询并分组渲染；`/config` 完成 list→edit→stage→publish→rollback；
`/flags` 完成 toggle/variant/rollout/kill。

**Acceptance Scenarios**:
1. **Given** 审计数据，**When** 进入 `/audit`，**Then** 按 day 分组、显示 actor 类型 pill、hash chain 校验状态、支持 quick filter。
2. **Given** 配置项，**When** edit→publish，**Then** 经 stage→published 流程，版本号递增，可 rollback。
3. **Given** 一个 flag，**When** toggle/调 rollout%/kill，**Then** 调对应契约并即时反映；UI 用 `useFlag` 判定。

### User Story 5 — Operate · Cells（核心差异化） (Priority: P3)

作为开发者，我能在 `/cells` 浏览 cell 列表（含 DurabilityMode 徽章），在 `/cells/:id` 通过多 tab
（Overview/Inventory/Interfaces/Wiring/Contracts/Dependencies/Tasks/Configuration/Audit/Slices/Groups/AI）
查看 cell 全貌；Interfaces 展示 ISP 四子接口（Identity/Lifecycle/Status/Inventory）。

**Why this priority**: MVP 最复杂页面（约 25% 工作量），但非闭环必需；可后置。

**Independent Test**: `/cells` 从 cell.yaml 派生 manifest 渲染列表 + Demo/Durable 徽章；
`/cells/:id` 各 tab 渲染（Audit/Configuration 复用真实数据，其余静态/派生）。

**Acceptance Scenarios**:
1. **Given** cell 清单，**When** 进入 `/cells`，**Then** 列表渲染并显示 `Demo`/`Durable` 徽章。
2. **Given** 一个 cell，**When** 进入 detail 切 tab，**Then** 各 tab 正确渲染；Audit/Config tab 拉真实数据。
3. **Given** Interfaces tab，**When** 渲染，**Then** 展示 Identity/Lifecycle/Status/Inventory 四子接口。

### User Story 6 — DevTools · 只读浏览（Contracts/Deps/Coverage/Groups） (Priority: P3)

作为开发者，我能浏览 `/contracts`（registry + governance gates CH-01..06）、`/deps`（4 视图 explorer）、
`/coverage`（实施进度矩阵）、`/groups`（Smart Groups preview）。

**Why this priority**: 开发者平台只读价值；数据多为静态/派生，独立性强。

**Acceptance Scenarios**:
1. **Given** 契约数据，**When** 进入 `/contracts`，**Then** 渲染 registry + typed envelope + governance gates。
2. **Given** go mod graph 派生数据，**When** 进入 `/deps`，**Then** 提供 list/graph/tree/matrix 4 视图切换。
3. **Given** coverage 数据，**When** 进入 `/coverage`，**Then** 渲染 gocell-web ↔ devboard 进度矩阵。

### User Story 7 — Landing & Observability v1 (Priority: P3)

作为运维，我能在 `/`（Health overview）看 cells 健康卡 + 系统信息 + 最近部署 + KPI 占位；
在 `/observe` 看 v1 简版 Overview/Logs/Traces 三 tab。

**Why this priority**: landing 体验 + 可观测入口；依赖后端 BR-001/002（必做）、BR-003（LGTM）。

**Acceptance Scenarios**:
1. **Given** BR-001/002 端点就绪，**When** 进入 `/`，**Then** 渲染 cells 健康卡 + 系统信息。
2. **Given** BR-003 LGTM 就绪，**When** 进入 `/observe`，**Then** Overview/Logs/Traces 三 tab 可用，Wave 2 tab 显示 disabled。

### Edge Cases

- 后端不可达 / 5xx：统一错误 envelope → i18n 文案，不泄漏内部细节。
- access 过期与 refresh 并发：单飞刷新，避免刷新风暴。
- PDP `/decide` 失败：fail-closed。
- setup 端点已 410：first-run 页提示已完成。
- 主题/语言切换：实时、无 FOUC。
- design-only / preview 路由：显式占位，不伪造数据。

## Requirements

### Functional Requirements

**基础设施 / 骨架（US0）**
- **FR-001**: 系统 MUST 组织为 pnpm workspace monorepo：`apps/web` + `packages/{core,shared,contracts,request,access,audit,config,observability,devboard}`，scope `@gocell`。
- **FR-002**: 每包 MUST 以 `src/index.ts` 为唯一出口，`package.json#exports` 收口；跨包仅经包名 import。
- **FR-003**: 第三方依赖版本 MUST 全部由 `pnpm-workspace.yaml#catalog:` 钉死，业务包以 `"catalog:"` 引用。
- **FR-004**: `tools/codegen/` MUST 用 json-schema-to-typescript 从 `../gocell/contracts/http/**/*.schema.json` 派生 `packages/contracts/src/`，提供 `pnpm codegen`；该目录只读，CI MUST `git diff --exit-code` 校验。
- **FR-005**: MUST 提供边界 ESLint（`no-restricted-imports` + `import/no-internal-modules`），违规阻断。
- **FR-006**: MUST 提供设计 token（`packages/core/src/styles/tokens.css` + `v1-linear.scss`）与明暗主题切换（`[data-theme]`，无 FOUC），AntD 经 ConfigProvider `theme.token` 注入。
- **FR-007**: MUST 提供全局 Layout（Sidebar 232px / TopBar 44px / CommandPalette 壳 / AppShell）置于 `@gocell/core`，含 5 组导航与状态 pill（live/preview/new/reserved）。
- **FR-008**: MUST 提供 i18n（vue-i18n 9，zh-CN/en-US 框架，默认中文）与全局错误码→i18n 映射表。
- **FR-009**: MUST 提供 Axios 实例：注入 `Authorization: Bearer`、401 单飞自动 refresh、错误 envelope→i18n，置于 `@gocell/request`。
- **FR-010**: 认证状态（user/token/PDP 缓存）MUST 为 Pinia store 置于 `@gocell/access`；`<Can>` UI 壳 + `useDecision()` 注入点置于 `@gocell/core`，PDP client 置于 `@gocell/access`。
- **FR-011**: 路由守卫 MUST：未登录→`/login`；未 setup→`/first-run-setup`；权限不足由 `<Can>` 控制（不在 meta 硬编 role）。
- **FR-012**: MUST 提供全局快捷键 ⌘K（命令面板）/ ⌘J（主题）/ ⌘\（侧栏）/ `/`（搜索）/ `G then ...`（跳转）/ Esc（关闭）。

**认证（US1）**
- **FR-020**: First-run 向导 MUST 5 步（Preflight→Two planes→Operator→Admin→Submit/Done），调 `GET /setup/status` + `POST /setup/admin`（Basic Auth 操作员 + body 业务两层身份）。
- **FR-021**: Login MUST 调 `POST /sessions/login` 返回 TokenPair（RS256），支持 `refresh`/`logout`。
- **FR-022**: 登录/setup 失败文案 MUST oracle-safe（统一 `ERR_AUTH_LOGIN_FAILED`，不暗示账号存在）。

**Access（US2/US3）**
- **FR-030**: `/access/identities` MUST 支持 list/create/get/update/patch/delete/lock/unlock/change-password（9 契约，MVP 仅 type=user，其余 disabled 占位）。
- **FR-031**: `/access/policies?tab=roles` MUST 支持 role list/check/assign/revoke 与 role-perm 矩阵；rules/templates tab disabled 占位。
- **FR-032**: `<Can action resource>` MUST 调 `POST /api/v1/access/decide`，仅控制 UI 显隐，PDP 失败 fail-closed。
- **FR-033**: `/access/decisions`、`/access/reviews` MUST 为占位（decisions 不在侧栏）。

**Operate（US4）**
- **FR-040**: `/audit` MUST 支持 hash chain 验证显示、按 day 分组、actor 类型 pill、quick filters（`auditquery`）。
- **FR-041**: `/config` MUST 支持 list+edit、stage/publish、版本化、rollback（`configread/write/publish/rollback`）。
- **FR-042**: `/flags` MUST 支持 bool/variant、rollout%、kill switch（`featureflag/flagwrite/flag.evaluate`），UI 用 `useFlag`。

**Cells（US5）**
- **FR-050**: `/cells` MUST 渲染 cell 列表 + DurabilityMode 徽章（Demo/Durable），数据 MVP 从 `../gocell/cells/*/cell.yaml` 静态派生。
- **FR-051**: `/cells/:id` MUST 提供多 tab（含 Interfaces 的 ISP 四子接口 Identity/Lifecycle/Status/Inventory）；Audit/Configuration tab 复用真实数据。

**DevTools（US6）**
- **FR-060**: `/contracts` MUST 渲染 registry + typed response envelope + governance gates CH-01..CH-06。
- **FR-061**: `/deps` MUST 提供 list/graph/tree/matrix 4 视图（go mod graph 派生）。
- **FR-062**: `/coverage` MUST 渲染 gocell-web ↔ devboard 实施进度矩阵。
- **FR-063**: `/groups` MUST 为 Smart Groups preview（UI 框架 + 静态规则，无后端）。

**Landing/Observe（US7）**
- **FR-070**: `/` MUST 渲染 cells 健康卡 + 系统信息 + 最近部署 + KPI 占位（BR-001/BR-002）。
- **FR-071**: `/observe` MUST v1 三 tab（Overview/Logs/Traces，BR-003 LGTM），Wave 2 tab disabled。

**横切**
- **FR-080**: 全部 design-only / preview 路由 MUST 显式占位标记，不伪造业务数据。
- **FR-081**: 业务文案默认中文，UI 框架文案双语；i18n 框架就位。

### Key Entities (前端视图模型，类型派生自 @gocell/contracts)

- **Session / TokenPair**：access + refresh（RS256），过期时间；驱动 auth store 与刷新。
- **Identity (User)**：用户主体；状态（active/locked）；MVP 仅 type=user。
- **Role / Permission / Assignment**：RBAC 模型；role-perm 矩阵。
- **Decision**：PDP `/decide` 输入（action,resource,subject）→ allow/deny + 缓存元数据。
- **AuditEntry**：actor 类型、操作、hash chain 链接、时间。
- **ConfigEntry / Version**：键值 + stage/published 状态 + 版本。
- **FeatureFlag**：bool/variant、rollout%、kill switch。
- **Cell / Slice / Contract / Dependency**：devboard 视图模型（多来自静态/派生）。
- **CellHealth / SystemInfo**：BR-001/002 健康与系统元信息。
- **ErrorEnvelope**：`error.code` + 详情，映射 i18n 文案。

## Success Criteria

### Measurable Outcomes (验收，PRD §10.1 / §10.1.1)

- **SC-001**: 全部 14 个 MVP 路由可访问、无空白页、无 console 错误。
- **SC-002**: 明暗主题实时切换无 FOUC；中英文切换实时生效（业务文案 ≥80% 中文优先，框架文案双语）。
- **SC-003**: 全局快捷键 ⌘K/⌘J/⌘\/Esc 工作。
- **SC-004**: 登录态过期自动 refresh；refresh 失败踢回 `/login`；首次部署 `/first-run-setup`→`/` 全流程走通。
- **SC-005**: 视觉与 V1 Linear 95%+ 一致（line-first / 单 accent / Serif H1 / Mono ID）。
- **SC-006**: Lighthouse Desktop Performance ≥ 85。
- **SC-007**: 单测覆盖率 ≥ 50%（每包独立 vitest，`pnpm -r test` 汇总；重点 auth flow / HTTP 拦截器 / theme+i18n store）。
- **SC-008**: `pnpm install` 一次成功；`pnpm -F @gocell/web dev` 起空白页无错误；`pnpm -r build` 全绿。
- **SC-009**: `pnpm codegen && git diff --exit-code packages/contracts/src/` 无 diff。
- **SC-010**: ESLint 边界规则跑通无跨包深路径违规；catalog 钉死版本在所有 `package.json` 以 `"catalog:"` 引用（无硬编版本号）。

### Out of Scope (非验收，PRD §2.2 / §10.2)

- 手机/平板适配（桌面优先 1280px+）。
- Plan 组真实数据、Build 组 AI/Sandbox 真实联调、Reserved 组（Billing/Secrets）真实功能 —— 仅占位。
- i18n 全量翻译覆盖（框架就位即可）。
- 端到端 trace pivot / blast radius / postmortem 等高级 observability。

## Assumptions & Dependencies

- 后端 `ghbvf/gocell@develop` 提供既有 33 个 HTTP 契约；新增端点见 BR-001/002/003/004。
- `<Can>` 依赖 BR-004 §4.1 `POST /api/v1/access/decide` 落地。
- `/` 依赖 BR-001（`/admin/health/cells`）+ BR-002（`/admin/system`）。
- `/observe` 依赖 BR-003（LGTM stack）。
- 契约 schema 路径 `../gocell/contracts/http/**/*.schema.json` 可读（codegen 输入）。
- Cells 列表 MVP 采用静态派生（`../gocell/cells/*/cell.yaml`），后续可换 `GET /api/v1/admin/cells`（未决，不阻塞）。
