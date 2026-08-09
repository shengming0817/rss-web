# Tasks: gocell-web MVP

**Input**: spec.md / plan.md / research.md / data-model.md / contracts/README.md
**Branch**: `001-gocell-web-mvp`

## Format: `[ID] [P?] [Story] Description`
- **[P]**: 可并行（不同文件/包，无依赖）
- **[Story]**: US0..US7（对齐 spec.md 用户故事 = Batch）
- 路径相对仓库根

## Path Conventions
- 应用：`apps/web/src/...`
- 包：`packages/<pkg>/src/...`
- 工具：`tools/codegen/...`
- 测试：与源码同包 `__tests__/`；E2E：`e2e/smoke/`

---

## Phase 1: Setup（Batch 0 骨架，US0）🎯 基座

> 骨架不受 ~2000 行限制（宪法 RL-12 例外）。

- [ ] T001 [US0] 根 `package.json`（type:module + scripts: dev/build/test/lint/codegen/format）+ `pnpm-workspace.yaml`（packages: apps/** + packages/**；`catalog:` 钉死全部第三方版本）
- [ ] T002 [US0] `tsconfig.base.json`（strict + `paths: @gocell/* → packages/*/src` + Bundler 解析）+ `.npmrc`（hoist-pattern）
- [ ] T003 [P] [US0] 9 个空包脚手架 `packages/{core,shared,contracts,request,access,audit,config,observability,devboard}`：每包 `package.json`（name `@gocell/x`、`exports` 收口 `./src/index.ts`、deps 用 `workspace:*` + `"catalog:"`）+ `tsconfig.json` + 空 `src/index.ts`
- [ ] T004 [US0] `apps/web` 脚手架：`package.json` + `vite.config.ts`（`server.proxy /api → VITE_API_BASE`）+ `main.ts` + `App.vue` + 空 `router/index.ts` + `.env.development`
- [ ] T005 [US0] 验证 `pnpm install` 一次成功 + `pnpm -F @gocell/web dev` 起空白页（SC-008）

## Phase 2: Foundational（Batch 0 基础设施，US0，BLOCKS 全部业务）

> **任务 ID 为稳定引用，与展示顺序解耦**（其他工件按 ID 引用）。本阶段遵循全文一致的 TDD：先就位测试基建（T023）→ 写失败测试（T024–T028）→ 再实现（T010–T022）。

#### 测试基建（前置，BLOCKS 下方测试）
- [ ] T023 [US0] 测试基建：根 `vitest.workspace.ts` + 每包 `vitest.config.ts`（jsdom，v8 ≥50%）+ `shared/__factories__` + `test-utils`（createTestPinia/createTestRouter）+ Playwright config + CI test workflow

#### Tests for Batch 0（TDD，先于实现）⚠️
- [ ] T024 [P] [US0] auth store 单测（生命周期/logout/重建持久化）— 对应实现 T017
- [ ] T025 [P] [US0] 401 单飞拦截器单测（单/并发 401 仅一次 refresh；失败 onAuthFail）— `it.each` 分支矩阵 — 对应实现 T016
- [ ] T026 [P] [US0] 守卫三段单测（memory history + 真实 Pinia，mock setup/PDP）— 对应实现 T020
- [ ] T027 [P] [US0] theme/i18n 单测（data-theme/localStorage/matchMedia；error-code→i18n `it.each`）— 对应实现 T013/T015
- [ ] T028 [P] [US0] Playwright 冒烟：shell 渲染、主题切换（登录重定向冒烟随 Batch 1 补）

#### Implementation（Batch 0，测试转绿）
- [ ] T010 [US0] `tools/codegen/`（json2ts glob `../gocell/contracts/http/**/*.schema.json` → `packages/contracts/src/`，分 ns + barrel + DO-NOT-EDIT banner）+ 根 `pnpm codegen`
- [ ] T011 [US0] 跑 `pnpm codegen` 产出 `packages/contracts/src/`，提交；CI workflow `codegen + git diff --exit-code`（SC-009）
- [ ] T012 [P] [US0] `@gocell/core` 设计 token：`styles/tokens.css`（移植 `docs/design/gocell/project/tokens.css`，oklch + `[data-theme=dark]`）+ `v1-linear.scss`（拆 `v1-linear.css`）
- [ ] T013 [P] [US0] `@gocell/core` theme：`useTheme()`（`[data-theme]` + localStorage + matchMedia，无 FOUC）+ `useThemeTokens()`（CSS 变量 → AntD seed token）
- [ ] T014 [US0] `apps/web` AntD `ConfigProvider :theme="{algorithm, token, cssVar:true}"` 接 useThemeTokens（依赖 T012 tokens + T013 useThemeTokens）
- [ ] T015 [P] [US0] i18n：vue-i18n 9（zh-CN 默认 / en-US 框架）+ locale store + 错误码映射表 `errors/<code>`（table 结构）
- [ ] T016 [P] [US0] `@gocell/request` axios 实例 + **`setupAxios({getToken,onRefresh,onAuthFail})` 依赖注入装配点**（禁 import access）+ Bearer 注入 + 401 单飞刷新队列 + error.code→i18n **key**（仅附 `errors.{code}` 字符串，翻译延迟到组件消费 `error.i18nKey`，不在拦截器调 `t()` → 不阻塞于 T015，research §5）
- [ ] T017 [P] [US0] `@gocell/access` auth store（Pinia：user/token 内存 + PDP 决策缓存；access token **不入 localStorage**）
- [ ] T018 [P] [US0] `@gocell/core` `<Can>` UI 壳 + `useDecision()` 注入点（inject 决策）；`@gocell/access` PDP client（基于 contracts 类型构建 + fail-closed + 5min 缓存；真实 `/access/decide` 接通见 T306，依赖 BR-004，未达用 stub）。注：`<Can>` 拆两层是单一交付物（PR-04），core/access 两半归同一 worktree
- [ ] T019 [US0] `apps/web` 全局 Layout：`AppShell` / `Sidebar`(232px，5 组导航 + 状态 pill) / `TopBar`(44px 面包屑) / `CommandPalette` 壳 / `AI BottomBar` 占位（置于 `@gocell/core`，apps/web 薄壳）
- [ ] T020 [US0] `apps/web` 路由守卫三段：first-run 门 → 认证门（→`/login`）→ PDP 授权门（`meta.requiredAction`，禁硬编 role）+ 装配 setupAxios 回调（依赖 T016 setupAxios + T017 auth store + T018 useDecision）
- [ ] T021 [US0] 全局快捷键：⌘K / ⌘J / ⌘\ / `/` / `G then ...` / Esc
- [ ] T022 [US0] 边界 ESLint：`import/no-restricted-paths` zones + `import/no-internal-modules`（resolver: typescript+vite）+ Prettier + husky + lint-staged（SC-010；宪法定为「Batch 0 末期落地」，C1 主控为 T016 的 setupAxios DI 结构性消解，lint 为双保险）

**Batch 0 验收**：SC-008/009/010 + 覆盖率门就位。

---

## Phase 3: Batch 1 — 认证入口（US1, P1）🎯 MVP 闭环起点

### Tests for US1 ⚠️
- [ ] T100 [P] [US1] login api 单测（成功存 token / 401 oracle-safe 统一文案）
- [ ] T101 [P] [US1] first-run 流程单测（status 门控 / admin 提交 / 410-409 跳 login）
- [ ] T102 [P] [US1] 集成：Login 组件提交→token→重定向（MSW）

### Implementation US1
- [ ] T103 [US1] `@gocell/access` Login 页（用户名+密码 → `sessions/login`，oracle-safe 文案 R3，错误码 i18n）
- [ ] T104 [US1] `@gocell/access` First-run 向导 5 步（Preflight `setup/status` → Two planes → Operator(Basic Auth) → Admin(body) → Submit/Done `setup/admin`；410/409 处理 R9）
- [ ] T105 [US1] App 挂载静默 refresh bootstrap（R7）+ logout（`DELETE /sessions` + 清状态）
- [ ] T106 [US1] `apps/web` 注册 access 认证路由 + 守卫接 setup/status

**Batch 1 验收**：SC-004（refresh/踢回/first-run 全流程）；oracle-safe 文案 review。

---

## Phase 4: Batch 2 — Access · Identities（US2, P2）[可与 B3/B4 并行]

### Tests for US2 ⚠️
- [ ] T200 [P] [US2] user api 单测（9 契约调用形状，复用 contracts 类型）
- [ ] T201 [P] [US2] 集成：列表 fetch/分页/筛选 + create/edit modal 校验（MSW）

### Implementation US2
- [ ] T202 [US2] `@gocell/access` Identities 列表页（`user.list`，表格 + quick filter + Durability/状态 pill）
- [ ] T203 [US2] create/edit/change-password modal + lock/unlock（`user.create/update/patch/lock/unlock/change-password`）
- [ ] T204 [US2] service-account / cell-as-principal disabled tab 占位（FR-030）
- [ ] T205 [US2] 操作按钮挂 `<Can>`（fail-closed）+ 路由 `meta.requiredAction`

**Batch 2 验收**：identities 全链路；无 role 硬编。

---

## Phase 5: Batch 3 — Access · Policies + `<Can>`（US3, P2）[可与 B2/B4 并行]

### Tests for US3 ⚠️
- [ ] T300 [P] [US3] `<Can>` 组件单测（allow 渲染 / deny 隐藏 / pending+error fail-closed）
- [ ] T301 [P] [US3] `useDecision` 单测（缓存 TTL / logout 失效 / 错误 fail-closed）
- [ ] T302 [P] [US3] 集成：roles 列表 + 矩阵 + assign/revoke（MSW `/decide`）

### Implementation US3
- [ ] T303 [US3] `@gocell/access` Policies 页 `?tab=roles`（`role.list` + role-perm 矩阵 + assign/revoke）
- [ ] T304 [US3] `tab=rules`/`tab=templates` disabled 占位卡（Wave 3/4）
- [ ] T305 [US3] `/access/decisions`（"Coming in Wave 2"，不在侧栏）+ `/access/reviews` 占位
- [ ] T306 [US3] 接通 `POST /access/decide`（依赖 BR-004 §4.1；未交付前用契约 stub + 标注）

**Batch 3 验收**：RBAC 视图 + `<Can>` 全站可用 + fail-closed。

---

## Phase 6: Batch 4 — Operate · Audit / Config / Flags（US4, P2）[可与 B2/B3 并行]

### Tests for US4 ⚠️
- [ ] T400 [P] [US4] audit/config/flags api 单测 + 错误处理
- [ ] T401 [P] [US4] 集成：audit 分组渲染 / config publish-rollback / flag toggle（MSW）

### Implementation US4
- [ ] T402 [P] [US4] `@gocell/audit` Audit 页（`auditquery`：hash chain 校验徽章、按 day 分组、actor pill、quick filters）
- [ ] T403 [P] [US4] `@gocell/config` Config 页（list+edit modal、stage/publish、版本化、rollback）
- [ ] T404 [P] [US4] `@gocell/config` Flags 页（bool/variant、rollout%、kill switch）+ `useFlag` composable（拉缓存，禁硬编 flag 名）

**Batch 4 验收**：三页真实数据闭环。

---

## Phase 7: Batch 5 — Operate · Cells（US5, P3，最复杂 ~25%）[依赖 B0，弱依赖 B4]

### Tests for US5 ⚠️
- [ ] T500 [P] [US5] cell manifest 派生单测（cell.yaml → 视图模型，DurabilityMode 徽章）
- [ ] T501 [P] [US5] 集成：list 渲染 + detail 各 tab 不报错

### Implementation US5
- [ ] T502 [US5] `@gocell/devboard` cell manifest 派生（静态读 `../gocell/cells/*/cell.yaml`，构建期生成 JSON）
- [ ] T503 [US5] Cells 列表页（`/cells`，Demo/Durable 徽章）
- [ ] T504 [US5] Cell detail 多 tab 框架（`/cells/:id`，Overview/Inventory/Interfaces(ISP4)/Wiring/Contracts/Dependencies/Tasks/Configuration/Audit/Slices/Groups/AI）
- [ ] T505 [US5] Audit/Configuration tab 复用 B4 真实数据（**弱依赖 T402/T403**；二者未就位时该两 tab 占位/loading 降级、显式标注，不阻塞 T504 框架与其余静态/派生 tab，呼应 FR-080）；其余静态/派生
- [ ] T506 [US5] Interfaces tab 展示 ISP 四子接口（Identity/Lifecycle/Status/Inventory）

**Batch 5 验收**：list + detail 全 tab 渲染。

---

## Phase 8: Batch 6 — DevTools 只读（US6, P3）[仅依赖 B0，可并行]

### Tests for US6 ⚠️
- [ ] T600 [P] [US6] contract/deps 解析单测（governance gates / go mod graph）

### Implementation US6
- [ ] T601 [P] [US6] `@gocell/devboard` Contracts 页（registry + typed envelope + gates CH-01..06）
- [ ] T602 [P] [US6] Deps 页（4 视图 list/graph/tree/matrix，go mod graph 派生）
- [ ] T603 [P] [US6] Coverage 页（gocell-web ↔ devboard 进度矩阵，内嵌静态）
- [ ] T604 [P] [US6] Groups 页（Smart Groups preview，UI 框架 + 静态规则）

**Batch 6 验收**：四页只读渲染 + 视图切换。

---

## Phase 9: Batch 7 — Landing & Observability v1（US7, P3）[依赖 B0 + BR-001/002/003]

### Tests for US7 ⚠️
- [ ] T700 [P] [US7] health card 状态色 / system info 解析单测

### Implementation US7
- [ ] T701 [US7] `@gocell/observability` Landing `/`（cells 健康卡 + 系统信息 + 最近部署 + KPI 占位；BR-001/002）
- [ ] T702 [US7] Observability `/observe` v1（Overview/Logs/Traces 三 tab；BR-003 LGTM）+ Wave 2 tab disabled
- [ ] T703 [US7] observability 路由 error boundary（LGTM 宕机优雅降级 R14）

**Batch 7 验收**：landing + observe v1（依赖后端 BR 交付）。

---

## Phase 10: Polish & Cross-Cutting

- [ ] T800 [P] 全站 `v-html` 审计（R10）+ CSP 头（生产）
- [ ] T801 [P] 业务文案中文优先 / 框架文案双语补全（SC-002）
- [ ] T802 Lighthouse Desktop ≥85 调优（SC-006）
- [ ] T803 覆盖率补到 ≥50%（每包）/ MVP 目标 60-70%（SC-007）
- [ ] T804 quickstart.md 验证全流程跑通

---

## Dependencies & Execution Order

### Phase 依赖
- Setup(P1) → Foundational(P2) **BLOCKS 全部**。
- US1(B1) 依赖 Foundational。
- US2/US3/US4 依赖 US1（auth + request + `<Can>` 基础），彼此**包隔离可并行**。
- US5/US6 仅依赖 Foundational，可与 US1-4 并行（US5 的 Audit/Config tab **弱依赖 US4/T402-T403**，未就位时占位降级）。
- US7 依赖 Foundational + 后端 **BR-001/002/003（硬交付门）**。

### 外部后端依赖（BR）
| BR | 阻塞 | 性质 | 处置 |
|---|---|---|---|
| BR-004 §4.1 `/access/decide` | US3/B3 的 `<Can>` 实数据（T306, PR-12） | **软/可延迟**：未交付前 T306 用契约 stub 标注推进，页面骨架与 RBAC 视图不阻塞 | 缓解：stub + fail-closed |
| BR-001 `/admin/health/cells`、BR-002 `/admin/system` | US7/B7 Landing（T701, PR-21） | **硬交付门** | 未达 landing 显占位 |
| BR-003 LGTM | US7/B7 `/observe`（T702, PR-22） | **硬交付门** | error boundary 降级 |

- Polish 依赖目标 batch 完成。

### 并行执行（git worktree + 包隔离）
- 同 batch 内 `[P]` 任务（不同包/文件）可并行。
- 跨 batch：B2/B3/B4/B5/B6 可由不同 worktree 并行推进（不同 `@gocell/*` 包，无文件冲突）。
- 同文件冲突归同一 worktree/agent（宪法工作流）。

### MVP 增量交付里程碑
1. **可登录闭环**：B0 + B1（SC-004/008/009/010）。
2. **Access 闭环**：+ B2 + B3。
3. **运维闭环**：+ B4。
4. **开发者平台**：+ B5 + B6。
5. **完整 MVP**：+ B7（待后端 BR）。
