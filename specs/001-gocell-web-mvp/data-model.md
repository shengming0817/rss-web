# Phase 1 Data Model — gocell-web MVP（前端视图模型）

> 前端不拥有数据真相；所有 wire 类型 **派生自 `@gocell/contracts`**（codegen 自后端 schema）。
> 本文件描述前端**视图模型 / store 状态 / 组件 props**，并标注其映射的后端契约与归属包。

## 1. 认证域（@gocell/access）

### Session / TokenPair
- 字段：`accessToken`(内存)、`refreshToken`(理想 httpOnly cookie / 待确认)、`expiresAt`、`sessionId`、`userId`、`passwordResetRequired`。
- 来源：`POST /sessions/login` / `/refresh` 响应（contracts: `HttpAuthSessionLogin*`）。
- 状态机：anonymous → authenticated（login/refresh）→ refreshing（401 单飞）→ anonymous（logout / refresh fail）。
- 派生：`isAuthenticated = !!accessToken`。

### Identity (User)
- 字段：`id`、`username`、`email?`、`status`(active/locked)、`type`(user | service-account*(disabled) | cell*(disabled))、`createdAt`、`passwordResetRequired`。
- 来源：`http.auth.user.*`（list/get/create/update/patch/delete/lock/unlock/change-password）。
- MVP：仅 `type=user`。

### Decision（PDP）
- 输入：`{ subject:{id,type}, action, resource:{id,type?} }` → `POST /access/decide`。
- 输出：`{ decision: allow|deny, reason?, matchedPolicies? }`。
- 前端缓存：`Map<cacheKey, {result, ts}>`，TTL 5min；fail-closed（pending/error → deny）。

### Role / Permission / Assignment（RBAC）
- `Role{id,name,description}`、`Permission{action,resource}`、role-perm 矩阵、`Assignment{subjectId, roleId}`。
- 来源：`role.list/check/assign/revoke`。

## 2. 审计域（@gocell/audit）

### AuditEntry
- 字段：`id`、`actorType`(user/service/cell/system)、`actorId`、`action`、`resource`、`timestamp`、`prevHash`、`hash`、`verified`(链校验结果)。
- 来源：`auditcore/auditquery`（`GET /api/v1/audit/...`，支持 filter）。
- 视图：按 day 分组；actor 类型 pill；quick filters；hash chain 校验徽章。

## 3. 配置域（@gocell/config）

### ConfigEntry / Version
- 字段：`key`、`value`、`stage`(staged/published)、`version`、`updatedBy`、`updatedAt`。
- 来源：`configread/configwrite/configpublish/rollback`。
- 流程：edit → stage → publish（version++）→ 可 rollback。

### FeatureFlag
- 字段：`id`、`type`(bool|variant)、`enabled`、`variants?`、`rolloutPercent`、`killSwitch`。
- 来源：`featureflag/flagwrite/flag.evaluate.v1`。
- 消费：`useFlag(id)` 拉缓存；UI `v-if="isEnabled('flag-id')"`（禁硬编 flag 名 → 由后端清单驱动）。

## 4. DevBoard 域（@gocell/devboard，多为静态/派生）

### Cell
- 字段：`id`、`name`、`subtype`(core/edge/support)、`durabilityMode`(Demo|Durable)、`slices[]`、`contracts[]`、`interfaces`(ISP 四子：Identity/Lifecycle/Status/Inventory)、`dependencies[]`。
- 来源：MVP 静态派生自 `../gocell/cells/*/cell.yaml`；Audit/Config tab 复用真实数据。

### Contract（registry）
- 字段：`name`、`kind`、`version`、`provider`、`consumers[]`、`envelope`(typed response)、`governanceGates`(CH-01..CH-06)。
- 来源：静态 + `gocell validate --strict` 输出。

### Dependency（deps explorer）
- 字段：`from`、`to`、`type`；4 视图：list / graph / tree / matrix。
- 来源：`go mod graph` 派生（静态）。

### CoverageRow / SmartGroup
- Coverage：`route`、`devboardSource`、`status`(done/wip/placeholder)。内嵌静态。
- SmartGroup：preview 级，UI 框架 + 静态规则，无后端。

## 5. 健康/系统域（@gocell/observability + apps/web landing）

### CellHealth（BR-001）
- 字段：`cellId`、`status`(ok/warn/err)、`durabilityMode`、`lastHeartbeat`、`metrics?`。
- 来源：`GET /api/v1/admin/health/cells`（BR-001，待交付）。

### SystemInfo（BR-002）
- 字段：`version`、`buildTime`、`gitSha`、`uptime`、`assembly`、`planes`(public/internal)。
- 来源：`GET /api/v1/admin/system`（BR-002，待交付）。

### Observability（BR-003 LGTM）
- v1 三 tab：Overview（KPI）/ Logs（Loki）/ Traces（Tempo）；Wave 2 tab disabled。

## 6. 横切

### ErrorEnvelope
- 字段：`error.code`、`error.message`(不直接渲染)、`error.details[]`、`error.requestId`。
- 来源：`shared/errors/error-response-v1.schema.json`（contracts 派生）。
- 映射：`error.code → errors.<code>` i18n key（table-driven 映射表）；requestId 仅 console。

### NavItem（@gocell/core Sidebar）
- 字段：`key`、`label`、`path`、`group`(Meta/Plan/Build/Access/Operate/Reserved)、`statusPill?`(live|preview|new|reserved)、`requiredAction?`(PDP，禁硬编 role)。

### ThemeState / LocaleState（apps/web stores）
- Theme：`isDark` ↔ `[data-theme]`，localStorage 持久；无 FOUC。
- Locale：`zh-CN`(默认) / `en-US`；vue-i18n。

## 实体关系（前端视角）

```
AuthStore(Session) ──drives──> 全局守卫 + Axios Bearer
Decision ──gates(UX)──> <Can> / NavItem.requiredAction / 路由 meta.requiredAction
Identity ──N:M(Role)──> Assignment ; Role ──N:M(Permission)──> 矩阵
ConfigEntry ──versioned──> publish/rollback ; FeatureFlag ──useFlag──> UI v-if
Cell ──has──> Slices/Contracts/Interfaces(ISP4)/Dependencies
CellHealth + SystemInfo ──> Landing(/)
ErrorEnvelope.code ──map──> i18n 文案（全局）
```
