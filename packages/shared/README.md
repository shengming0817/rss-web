# @gocell/shared

> 跨包纯工具函数 / 常量 / 类型（无业务、无 store、无 UI）

- **对应后端 cell**：无（基础设施层）
- **对外 exports**：`.` → `src/index.ts`（唯一收口；未列出路径外部不可访问）
- **依赖 contract**：（待 Batch 实施时补全）

## 边界

依赖规则见仓库根 `CLAUDE.md` §依赖规则。本包为最底层工具包，**禁止依赖任何 `@gocell/*` 包**（含 contracts/request）；消费方经 `workspace:*` 引用本包。
