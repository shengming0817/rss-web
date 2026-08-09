# @gocell/cell-manifest

> Cell manifest 单向派生器：后端 `gocell/corecells/*/cell.yaml` + `slices/*/slice.yaml` → `packages/devboard/src/manifest/cells.generated.ts`。

是 AI-robust「Hard」约束的执行体（`ai-robust.md` §载体决策原则 第 1 条）：单源 YAML 派生 + CI `git diff --exit-code` 守门（`.github/workflows/cell-manifest-diff.yml`），业务包手改生成物在 CI 不可表达。生成文件带 `: CellManifest` 类型注解（来自 devboard 的规范 `./types`），任何形状漂移在 `@gocell/devboard typecheck` 失败。

## 运行

```bash
pnpm cell-manifest   # = pnpm -F @gocell/cell-manifest generate
```

- **源路径**：默认 `<repo>/../gocell/corecells`（gocell-web 与后端 gocell 同级 checkout；CI 亦如此布局）。可经环境变量 `GOCELL_CELLS_DIR` 覆盖（如 git worktree 本地开发：`GOCELL_CELLS_DIR=../gocell/corecells pnpm cell-manifest`）。
- **产物**：`packages/devboard/src/manifest/cells.generated.ts`，带 `/* eslint-disable */` + DO-NOT-EDIT banner（已加入 `eslint.config.js` ignores + `.prettierignore`）。

## 派生规则

- `cell.yaml` → `CellEntry`（id / type / consistencyLevel / durabilityMode / owner / goStructName / schema.primary / requires / l0Dependencies / verify.smoke）。`name` = goStructName；`domain` = 去尾 `core` 后 title-case。
- `slice.yaml` 的 `contractUsages[].role`：`serve`/`publish` → cell **produces**；`call`/`subscribe` → **consumes**（按 contract 去重 + 排序）。
- 跨 cell 依赖：某 cell consume 的契约由另一 cell serve/publish → `dependsOnCells`；反向得 `requiredByCells`。
- **未知 role 静默忽略**（不抛错）——构建工具读外部 YAML 须对后端契约演进鲁棒；新增 role 在前端补支持前不分类，而非令派生崩溃。反向自检见 `src/derive.spec.ts`。

## 确定性来源（CI 不误红的前提）

- 排序遍历（目录条目字典序）+ produces/consumes/dependsOnCells/cells 均排序。
- 输出 `JSON.stringify(manifest, null, 2)`（对象已有序）；无时间戳字段。
- 类型由本工具自包含的 `src/types.ts` 提供（规范源为 `packages/devboard/src/manifest/types.ts`，漂移由 devboard typecheck 守门，见上）。

## 测试

```bash
pnpm -F @gocell/cell-manifest test
```
