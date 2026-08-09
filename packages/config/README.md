# @gocell/config

> 对应后端 cell：`cells/configcore/`

Configuration entry management (config CRUD + stage/publish + version + rollback).
Feature flags 由 C2 agent 追加。

## 对外 exports

- `.` → 主入口：`useConfigStore`, `ConfigEntry` type（C2 追加 flags 导出）
- `./stores` → `useConfigStore`（C2 追加 `useFlagsStore`）
- `./views/config` → `ConfigView.vue`（配置项页面）
- `./views/flags` → `FlagsView.vue`（C2 实现）
- `./composables` → composables 入口（C2 如需可追加）

## 依赖的 contract

- `HttpConfigListV1Response` (`http/config/list/v1/response.ts`)
- `HttpConfigGetV1Response` (`http/config/get/v1/response.ts`)
- `HttpConfigWriteV1Request` (`http/config/write/v1/request.ts`)
- `HttpConfigUpdateV1Request` (`http/config/update/v1/request.ts`)
- `HttpConfigPublishV1Response` (`http/config/publish/v1/response.ts`)
- `HttpConfigRollbackV1Request` (`http/config/rollback/v1/request.ts`)
- `HttpConfigRollbackV1Response` (`http/config/rollback/v1/response.ts`)

## 能力（config 域）

- `useConfigStore` — Pinia setup store (id: `config.entries`)
  - state: `entries`, `loading`, `errorKey`, `nextCursor`, `hasMore`, `filter`, `mutating`
  - getters: `filteredEntries` (client-side key filter)
  - read: `fetchList()`, `loadMore()`
  - mutations (re-throw on failure): `create()`, `update()` (CAS), `publish()`, `rollback()` (CAS), `remove()`
  - sensitive write guard: `create`/`update` reject if `value === "******"`
- `ConfigEntry` — codegen-derived entry type from list contract
- `CONFIG_URL` — `/api/v1/config/` collection URL constant

## 设计决策（降级）

| 决策 | 原因 |
|------|------|
| stage/publish 语义：write/update = 暂存，publish = 快照发布 | 契约无显式 draft 态；UI 副标题说明 |
| sensitive 脱敏：编辑时留空+提示，guard 防止 `"******"` 回写 | 后端 sensitive=true 返回 `"******"` 占位 |
| rollback 手填 version number input（min=1, max=current-1）| 无 version-history 端点（BR-008 pending） |
| CAS 冲突：store mutation re-throw，drawer/dialog inline alert | 409 `ERR_VERSION_CONFLICT` → caller handles |

## 测试

```bash
pnpm -F @gocell/config test --run
pnpm -F @gocell/config test:coverage --run
pnpm -F @gocell/config typecheck
```

## 边界

依赖规则见仓库根 `CLAUDE.md` §依赖规则。跨包仅经 `@gocell/contracts` 类型 + `@gocell/request` client，禁深路径 import。

## 维护者

config 域（config CRUD/stage/publish/rollback）由 C1 agent 实现。
flags 域（feature flags）由 C2 agent 追加（`src/stores/index.ts`、`src/index.ts`、本 README 的 flags 段）。

---

## flags 域（feature flags）

feature flag 增删改查 + rollout% + kill switch + typed composable。

### 对外 exports（flags 域）

- `.` → 追加：`useFlagsStore`, `useFlag`, `FLAG_KEYS`, `type FlagKey`, `type FeatureFlag`
- `./stores` → 追加：`useFlagsStore`
- `./composables` → `useFlag`, `FLAG_KEYS`, `type FlagKey`
- `./views/flags` → `FlagsView.vue`（flags 管理页面）

### 依赖的 contract（flags 域）

- `HttpConfigFlagsListV1Response` → `FeatureFlag` 行类型
- `HttpConfigFlagsCreateV1Request` → 创建 payload
- `HttpConfigFlagsUpdateV1Request` → 全量更新（含 rollout%）
- `HttpConfigFlagsToggleV1Request` → kill switch partial flip
- `HttpConfigFlagsEvaluateV1Request/Response` → admin evaluate（仅 api 层暴露）

### 能力（flags 域）

- `useFlagsStore` — Pinia setup store (id: `config.flags`)
  - state: `flags`, `loading`, `errorKey`, `nextCursor`, `hasMore`, `filter`, `mutating`
  - getters: `filteredFlags`（client-side key filter）, `isEnabled(key)`（供 useFlag 消费）
  - read: `fetchList()`, `loadMore()`
  - mutations (re-throw on failure): `create()`, `update()` (CAS, full), `toggle()` (CAS, partial flip), `remove()`
- `useFlag(key: FlagKey)` — **Hard档 AI-robust** typed composable
  - 形参 `FlagKey` 为 `FLAG_KEYS as const` 的字面量联合，传未知字符串 → 编译期 error
  - 数据源：`useFlagsStore.isEnabled()` list 缓存；不调用 /evaluate
  - fail-safe: key 不在缓存 → `enabled = false`
- `FLAG_KEYS` — 已知 flag key 注册表（`as const`，逐条显式登记）
- `FlagKey` — 字面量联合类型，`typeof FLAG_KEYS[keyof typeof FLAG_KEYS]`
- `FeatureFlag` — codegen-derived flag 行类型（list contract）

### 设计决策（降级，flags 域）

| 决策 | 原因 |
|------|------|
| variant 配置 UI 不实现，type 字段只读展示 + 占位提示 | 后端 create/update/evaluate 无 variant payload（BR-007 pending） |
| kill switch = toggle 端点 `enabled:false`，danger 二次确认 | 与 update 端点区分；toggle 仅翻 enabled，rollout% 走 PUT |
| rollout% 更新走 PUT update 全量 | toggle 端点不含 rolloutPercentage |
| useFlag 形参 FlagKey 字面量联合（Hard 档） | 禁前端硬编 flag 名（PRD §308）；未知 flag 名编译期 error |
| useFlag 消费 list 缓存而非 /evaluate | evaluate 是 admin POST，不适合高频调用 |
