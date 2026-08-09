# @gocell/devboard

> 开发者平台聚合视图：Cells / Groups / Coverage / Contracts / Deps（Batch 5/6）
>
> **对应后端 cell**：无（聚合派生视图）。Cells 数据由构建期从后端 `../gocell/corecells/*/cell.yaml` + `slices/*/slice.yaml` 派生（见下）。

## 对外 exports

- `.` → `src/index.ts`：manifest 类型、`CELL_MANIFEST`、`useCellsStore`、共享组件（`CellDurabilityBadge`）
  注：`UnavailablePanel` 已提升至 `@gocell/core`，不再由本包导出。
- `./views/cells-list` → `CellsListView.vue`（`/cells` 列表页，T503）
- `./views/cell-detail` → `CellDetailView.vue`（`/cells/:id` 12-tab 详情，T504）
- `./views/contracts` → `ContractsView.vue`（`/contracts` 平台级 contract registry，T601）
- `./views/deps` → `DepsView.vue`（`/deps` cell 依赖 explorer，4 视图 list/graph/tree/matrix，T602）
- `./views/coverage` → `CoverageView.vue`（`/coverage` 实施进度矩阵，T603）
- `./views/groups` → `GroupsView.vue`（`/groups` Smart Groups preview，T604）

未列出的路径外部不可访问（`package.json#exports` 唯一收口）。

## Batch 6 DevTools 只读页（平台级，区别于 cell-detail 内同名 tab）

四页全部落本包，零跨包 import、零后端调用、零图形库依赖（graph/tree/matrix 纯 SVG/CSS）。数据分两类，严守 **绝不伪造**：

| 页面 | 真实派生（自 `CELL_MANIFEST`） | 静态快照（明确标注，待后端） |
|---|---|---|
| `/contracts` | contract registry：聚合所有 cell 的 `produces`/`consumes` → serve/call 关系（`composables/useContractsRegistry.ts`） | governance gates CH-01..06 + typed response envelope（`data/governanceGates.ts` / `data/responseEnvelopes.ts`，页头 `静态快照` banner，待接 `gocell validate --strict`） |
| `/deps` | cell 间依赖图：自 `dependsOnCells`/`requiredByCells` 派生 edges/forest/matrix（`composables/useDepsGraph.ts`） | —（不引入 go mod 包级快照，避免伪造；cell 级依赖随后端真实增长） |
| `/coverage` | —（与 `CELL_MANIFEST` 正交） | 实施进度矩阵（`data/coverageMatrix.ts`，手维护 meta，真相源 `dev-coverage.jsx`，PRD §514） |
| `/groups` | 成员实时计算：predicate 对真实 manifest 字段求值（`data/smartGroups.ts` `groupMembers`） | 分组规则定义（5 条，predicate 仅用可派生字段 domain/tier/durability/依赖数/契约数，preview 级无持久化） |

PDP 门：后端无 `contract`/`dep`/`group` resource，路由守卫降级到 `requiredResource: 'cell'`（同 `/cells`）；`/coverage` 为 dev-tool 自览，仅 `requiresAuth`（设 `requiredAction` 会对不存在的 resource fail-closed）。

## Cell manifest 派生（T502，AI-robust Hard）

`tools/cell-manifest/` 镜像 `tools/codegen` 模式：构建期读后端 `cell.yaml` + `slice.yaml` → 派生 `src/manifest/cells.generated.ts`（`/* eslint-disable */` + DO-NOT-EDIT banner，prettier-ignored）。

- 单源派生 + CI `git diff --exit-code`（`.github/workflows/cell-manifest-diff.yml`）守门，业务包手改生成物即红 → 违反不可表达（Hard）。
- 本地重跑：`GOCELL_CELLS_DIR=../gocell/corecells pnpm cell-manifest`（CI 把 `ghbvf/gocell` checkout 为同级目录，默认路径生效）。
- `slice.yaml` 的 `contractUsages[].role`：`serve`/`publish` → cell **produces**；`call`/`subscribe` → **consumes**；跨 cell 的 consume→produce 解析出 `dependsOnCells` / `requiredByCells`。
- **不可派生字段**（运行时 QPS/p95/健康分、tasks、SLOC、version、oncall）→ 显式降级为 "—" / `UnavailablePanel`，**绝不伪造**。需后端健康端点（BR-001）才补。

## 依赖的 contract

- `http.audit.list.v1`（`HttpAuditListV1Response`）→ Cell detail · Audit tab（经 `@gocell/request` 直调 `/api/v1/audit/`，**不** import `@gocell/audit`）
- `http.config.list.v1`（`HttpConfigListV1Response`）→ Cell detail · Configuration tab（直调 `/api/v1/config/`，**不** import `@gocell/config`）

## 边界

依赖规则见仓库根 `CLAUDE.md` §依赖规则 / `.claude/rules/gocellweb/package-boundaries.md`。跨包仅经 `@gocell/contracts` 类型 + `@gocell/request` client，禁深路径 import。

**已批准设计性例外**：*允许*依赖 `@gocell/access`（消费其 PDP client 能力）——因 devboard 所有页面都依赖 PDP；其他业务包不享有此例外。当前 Cells 页为只读、页面级 PDP 由路由守卫执行，故 **暂未**实际 import `@gocell/access`（需要 in-component 决策时再加 dep）。**禁**直接 import `@gocell/audit` / `@gocell/config`（Audit/Config tab 经 `@gocell/request` + `@gocell/contracts` 复用同一后端端点，T505 边界洁净方案）。

**`<Can>` / PDP 归属**（PRD §9/§211）：`<Can>` 组件 + `useDecision()` 注入点唯一归属 `@gocell/core`；PDP client 实现（`createPdpClient`）归属 `@gocell/access`，由 `apps/web` 装配层注入。Cells 页为只读，页面级 PDP 门由路由守卫（`requiredAction: 'read'`, `requiredResource: 'cell'`，fail-closed）执行。

## 测试

`pnpm -F @gocell/devboard test --run`（manifest 派生器：`pnpm -F @gocell/cell-manifest test --run`）
