---
name: git-worktree
description: Git Worktree 项目约定（编号、基准分支、`-C` 路径用法、删除安全）。
---

# gocell-web Git Worktree 约定

## 约束

- 目录：`worktrees/<NNN-short-name>`
- 基准：创建前 `git fetch origin`，基于 `origin/develop`
- 编号区间：
  - Feature `001-199`
  - Fix `200-299`
  - Refactor `500-599`
  - PR review-only（`pr-review` skill 自动建）`review-pr<N>`（不占编号区间）
- 编号取法：扫 `worktrees/` 目录 + `git branch -a`，对应区间内最大 +1
- 禁止 `cd worktrees/xxx && ...`，替代方案：
  - git：`git -C worktrees/xxx ...`
  - pnpm：`pnpm -C worktrees/xxx ...`（注意 `-C` 是 pnpm 的工作目录 flag，与 git 一致）
  - 组合 `-F`：`pnpm -C worktrees/xxx -F @gocell/<pkg> test --run`
- 用完即删 `git worktree remove worktrees/<NNN>`
- 删除前自检：`git -C worktrees/<NNN> status` 必须 clean；有未提交改动 → 报警，**禁止** `-f` 强删

## 创建流程

```bash
git fetch origin                                            # dangerouslyDisableSandbox: true
git worktree add worktrees/<NNN-short-name> -b <branch> origin/develop
```

`<short-name>` 用 kebab-case，简短描述任务核心（如 `001-claude-setup` / `042-access-policies` / `201-fix-axios-401-loop`）。分支名通常与目录名一致。

## review-only worktree（pr-review skill 自动）

```bash
git fetch origin <BRANCH>
git worktree add --detach worktrees/review-pr<N> origin/<BRANCH>
```

review-only worktree 在 `pr-review` 完成后必须主动提示用户清理：
```
🧹 清理：git worktree remove worktrees/review-pr<N>
```

## 与并行 AI 隔离的关系

- **物理隔离**走 worktree（本文档约定）
- **逻辑隔离**走 pnpm `workspace:*` + `package.json#exports` + ESLint `no-restricted-imports`
- 两层组合后，多 agent 在不同 worktree 改不同 package，互不串改
- 跨包改动 → 必须先在计划阶段说明，避免两个 worktree 同时碰一个包

## 失败模式与处理

| 现象 | 原因 | 处理 |
|------|------|------|
| `fatal: '<branch>' is already checked out at ...` | 同名分支已被另一 worktree 占用 | 用既有 worktree 或先 `git worktree remove` |
| `pnpm install` 在 worktree 里报缺包 | worktree 没跑过 install / lockfile 不同步 | 在 worktree 内重跑 `pnpm install --frozen-lockfile` |
| `Cannot find module '@gocell/<x>'` | workspace 协议链接未建立 | `pnpm -C worktrees/<NNN> install` |
| 切换 worktree 后 dev server 端口冲突 | 多个 worktree 都跑 vite dev | 指定 `--port`：`pnpm -C worktrees/<NNN> -F @gocell/web dev --port 5174` |
