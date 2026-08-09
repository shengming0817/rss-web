# @gocell/audit

> 对应后端 cell：`cells/auditcore/` (`auditquery` slice — cursor-paginated audit log list)

## 对外 exports

- `.` → 主入口：`useAuditStore` store + `AuditEntry` 类型
- `./stores` → `useAuditStore`（Pinia setup-store）
- `./views/audit` → `AuditView.vue`（路由级页面组件）

## 依赖的 contract

- `HttpAuditListV1Response` (v1) — `packages/contracts/src/http/audit/list/v1/response.ts`
  - 行类型：`AuditEntry = HttpAuditListV1Response['data'][number]`

## 已知后端缺口（BR-006）

契约当前缺少以下字段（设计稿有，后端未暴露）：

| 字段 | 降级处理 |
|------|---------|
| `hash` / `prevHash` | chain integrity card 显示 "verification unavailable" |
| `result` (ok/denied/failed) | 不在 UI 展示 |
| `reason` | 不在 UI 展示 |
| `actor.ip` / `actor.mfa` | 不在 UI 展示 |
| `actorType` | classifyActor 启发式前缀推断（见 `src/lib/auditClassify.ts`） |

后端补字段 + `pnpm codegen` 后，hash chain 校验将自动激活（verifyChain 已完整实现）。

## 提供给其他包的能力

- `useAuditStore` — audit log 查询 store（列表 / 分页 / 过滤 / 分组 / chain status）
- `AuditEntry` — 单条审计条目类型（codegen-derived）

## 内部模块（不在 exports，不可跨包直接引用）

- `src/api/audit.ts` — HTTP 层（listAudit）
- `src/lib/hashChain.ts` — 纯函数 verifyChain
- `src/lib/auditClassify.ts` — classifyActor + groupByDay
- `src/components/ActorPill.vue` — 行内角色装饰组件

## 测试

```bash
pnpm -F @gocell/audit test --run
pnpm -F @gocell/audit test:coverage --run
pnpm -F @gocell/audit typecheck
```

## 边界约束

- 禁 import `@gocell/access` / `@gocell/config` / `@gocell/observability` / `@gocell/devboard`
- 跨包只走 `@gocell/contracts` 类型 + `@gocell/request` client + `@gocell/core` UI 壳
- 禁深路径 `@gocell/x/src/...`
