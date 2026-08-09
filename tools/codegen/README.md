# @gocell/codegen

> 契约类型单向派生器：后端 `gocell/contracts/{shared,http}/**/*.schema.json` → `packages/contracts/src/`。

是 AI-robust「Hard」约束的执行体（`ai-robust.md` §载体决策原则 第 1 条）：单源 schema 派生 + CI `git diff --exit-code` 守门，业务包手改生成物在 CI 不可表达。

## 运行

```bash
pnpm codegen   # = pnpm -F @gocell/codegen generate
```

- **契约源路径**：默认 `<repo>/../gocell/contracts`（gocell-web 与后端 gocell 同级 checkout；CI 亦如此布局）。可经环境变量 `GOCELL_CONTRACTS_DIR` 覆盖（如 git worktree 本地开发）。
- **产物**：镜像源目录树到 `packages/contracts/src/`，每文件带 `/* eslint-disable */` + DO-NOT-EDIT banner；根 `src/index.ts` 为 type-only barrel。
- **全量重建**：每次先清空 `src/`，删除的 schema 同步消失。

## 命名空间顺序与去重

`NAMESPACES = ['shared', 'http']`，**顺序即去重优先级**。`$ref` 跨文件共享类型被内联进每个引用方（`declareExternallyReferenced: true`）；barrel 全局首现胜出去重，shared 在前 → 共享类型归属其 shared 规范源文件，http 侧内联副本不重复导出（有去重发生时打 `console.warn`）。

## 确定性来源（CI 不误红的前提）

- 排序遍历（`derive.collectSchemas`：目录条目 + 结果均字典序）。
- barrel 模块路径与名字均排序（`derive.renderBarrel`）。
- formatter 由版本锁定的 `json-schema-to-typescript` 提供；catalog + `--frozen-lockfile` 钉死。

工具链升版后须本地重跑 `pnpm codegen && git add packages/contracts/src/` 再提交。

## 已知盲区

barrel 类型抽取（`derive.extractExportedNames`）覆盖 `export interface|type|enum|class`；**不覆盖** re-export（`export { X } from`）、值导出（`export const/default`）、`export namespace`。json-schema-to-typescript 当前产物不产生这些形态。反向自检见 `src/derive.spec.ts`。

## 测试

```bash
pnpm -F @gocell/codegen test
```
