# @gocell/contracts

> 由 codegen 从后端 *.schema.json 单向派生的 TS 类型（只读，业务包禁手改）

- **对应后端 cell**：../gocell/contracts/
- **对外 exports**：`.` → `src/index.ts`（唯一收口；未列出路径外部不可访问）
- **依赖 contract**：（待 Batch 实施时补全）

## 边界

依赖规则见仓库根 `CLAUDE.md` §依赖规则。本包为 `tools/codegen` 只读派生产物，无运行时依赖；业务包**不得手改** `src/`，CI `git diff --exit-code` 守门拦截。
