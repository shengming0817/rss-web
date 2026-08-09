# @gocell/observability

> 对应后端 cell：无（前端壳，对应 BR-003 LGTM 接入；后端无对应 cell）

## 对外 exports

- `.` → `src/index.ts`（主入口，组件 / Composable / store 汇总）
- `./stores` → `src/stores/index.ts`（`useHealthStore`、`useObserveStore`）
- `./composables` → `src/composables/index.ts`（`useHealthPoll`）
- `./views/landing` → `src/views/LandingView.vue`（`/` 健康总览页，T701）
- `./views/observe` → `src/views/ObserveView.vue`（`/observe` 可观测页，T702）

未列出的路径外部不可访问（`package.json#exports` 唯一收口）。

## 依赖的 contract

本包当前无 codegen 派生的 contract——`src/api/*.ts` 中的类型为**本地临时类型**，直接对应
Prometheus / Loki / Tempo 上游 HTTP 响应格式（BR-001/002/003 的 BFF 契约 schema 尚未落库）。
当后端 BFF 合同 schema 落入 `../gocell/contracts/`、`pnpm codegen` 生成对应类型后，
请删除 `src/api/` 中的本地类型，改为从 `@gocell/contracts` 导入。

## 边界

依赖规则见仓库根 `CLAUDE.md` §依赖规则。跨包仅经 `@gocell/contracts` 类型 + `@gocell/request` client，禁深路径 import。

## 测试

`pnpm -F @gocell/observability test --run`
