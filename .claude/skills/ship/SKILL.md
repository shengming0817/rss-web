---
name: ship
description: "全流程实施：探索→计划→worktree→TDD→实施→PR→review→fix Cx1/Cx2→人工确认。L1（跳过探索，1 reviewer）/ L2（单 explorer，1 reviewer）/ L3（默认，三 explorer，按 diff 行数 0/2/3/6 reviewer 自动，<200 行主 agent 自审）"
argument-hint: "[--level=L1|L2|L3] <#issue-number 或任务描述>"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion]
---

# gocell-web Ship — 全流程实施

默认 L3（三 explorer + 详细计划 + 与用户确认 + 按 diff 行数自动 0/2/3/6 reviewer，见阶段 7）。

剥离 `--level=` flag 后，剩余参数匹配 `^#?[0-9]+$` 视为 GitHub issue 号，先 `gh issue view <N> --json title,body,labels,state`（`dangerouslyDisableSandbox: true`）拉取作为任务上下文；后续以 issue title/body 替代自由文本，阶段 6 PR body 追加 `Closes #<N>`。`state != "OPEN"` 或 `gh issue view` 失败 → AskUserQuestion 让用户裁定。

## 等级

| 等级 | 探索 | 计划确认 | 实施 agent | review |
|------|------|---------|-----------|--------|
| L1 | 不探索 | 不需要 | 1-2 并行 | 1 reviewer |
| L2 | 1 explorer | 展示给用户 | 1-2 并行 | 1 reviewer |
| L3（默认） | 3 并行 explorer | AskUserQuestion 确认 | ≤ 4 并行 | 1/2/3/6 reviewer（阶段 7） |

---

## 阶段 1：探索（L1 跳过）

**L2**：1 个 `explorer` agent，对标主流 Vue 后台（Vben / Pure Admin / AntD Pro Vue 等，查 `docs/references/`），用 WebFetch 拉源码提取组件结构、Composables 模式、Pinia 组织、路由守卫写法；产出采纳建议与偏离理由。

**L3（默认）**：并行启动 3 个 `explorer` agent：
1. **对标 Vue 头部后台实现**（组件 / store / 路由 / 边界）
2. **测试策略**（vitest 用例形态 + Pinia 测试 + Playwright 冒烟边界）
3. **a11y / 设计 token 一致性 / bundle 影响**（边界条件 + 性能）

全部完成后按"方案与计划原则"汇总，执行"反思自检"，再 **AskUserQuestion 与用户确认方案方向**。

---

## 方案与计划原则（阶段 1 汇总 / 阶段 2 计划必须满足）

- **彻底**：根因 + 完整解法，不留 TODO / FIXME / follow-up；范围内紧密相关的小工作一并纳入，不拆 P2/后续 PR
- **不向后兼容**：删字段 / 改签名 / 换实现直接做，不留 deprecation 别名、shim、旧路径
- **优雅简洁**：用最少代码改动达成目标，不引入新抽象层、不预设未来需求
- **设计对标**：是否符合 PRD §4 设计 DNA + V1 Linear 风格；偏离写明理由
- **包边界对标**：跨包改动是否走 contract / request；是否触发 `package.json#exports` 更新

### 反思自检（AskUserQuestion 前强制）

呈现给用户前逐条自查并在确认问题中如实回答：

1. **彻底**：方案/计划里是否还藏 TODO、兼容代码、未列入的关联工作？→ 合并进当前 PR 或写明 blocker 理由
2. **不向后兼容**：是否引入 deprecation 别名、旧字段保留、双路径并存？→ 删掉或写明理由
3. **优雅简洁**：能否用更少代码、更少抽象、更少新文件达成？→ 简化或写明理由
4. **设计 DNA**：是否引入多 accent / 彩色 chip / 大圆角 / emoji / 渐变等 PRD §4 反模式？→ 修正或写明
5. **包边界**：跨包 import 是否走 `package.json#exports`？有无深路径 `@gocell/foo/src/...`？→ 修正

任一条不通过 → AskUserQuestion 中**显式列出取舍及理由**，不得默认放行。

---

## 阶段 2：计划（L1 跳过）

按"方案与计划原则"生成：改动文件清单（按依赖顺序）/ 任务分组（串行 vs 并行批次）/ TDD 测试先写清单 / 对标参考（`ref: <project> <file>`）/ 涉及包列表（用于阶段 7 reviewer 上下文）。生成后执行"反思自检"，L3 用 AskUserQuestion 确认。

**并行批次分析**（改动文件 ≥ 4 时必须明确）：
- 标注各任务的文件归属与批次编号
- 标注批次间依赖（有依赖 → 串行；无依赖 → 可并行）
- 解决同文件冲突：同一文件归同一批次 / agent
- 跨包改动 → 优先按包拆批次（与 §并行 AI 隔离 对齐）

---

## 阶段 3：Worktree

依 `git-worktree` skill 约定，基于 `origin/develop` 创建：

```bash
git fetch origin
git worktree add worktrees/<NNN-short-name> -b <branch-name> origin/develop
pnpm -C worktrees/<NNN-short-name> install --frozen-lockfile   # 新 worktree 必跑：建立 workspace:* 软链
```

编号区间：Feature `001-199` / Fix `200-299` / Refactor `500-599`。扫描 `worktrees/` + `git branch -a` 取最大 +1。`pnpm install` 不跑 → 阶段 4 测试会报 `Cannot find module '@gocell/<x>'`（详见 `.claude/skills/git-worktree/SKILL.md` §失败模式）。

---

## 阶段 4：TDD — 先写测试

在 worktree 中先写 `*.spec.ts`（vitest）/ `*.e2e.ts`（playwright，仅关键路径）：覆盖正常 / 边界 / 错误路径。`packages/core/` ≥ 90%、其余 ≥ 80%。

```bash
pnpm -C worktrees/<NNN> -F @gocell/<pkg> test --run
```

确认测试先 **FAIL**，再进入实施。纯文档 / 配置类改动（无可测产物）→ 本阶段记录"N/A：文档/配置类"后跳过，但必须在阶段 7 review 中重点查文档一致性。

---

## 阶段 5：实施

### 5.0 分组与并行度（实施前必须执行）

主 agent 据阶段 2 改动文件清单与批次依赖**自主决定**：
- 无文件交叉且无逻辑依赖 → 并行启动 `vue-developer` agent
- 有依赖或改同一文件 → 串行或归同一 agent

**硬约束**：
- 同一文件只能分给同一 agent
- 跨包改动优先按包拆分（与"并行 AI 隔离"对齐）
- 有前置依赖的批次必须等上一批全完成
- 并行 `vue-developer` 上限 **4 个**

### 5.1 Sub-agent prompt 自包含要求

每个 `vue-developer` sub-agent prompt 必须包含：
- worktree 路径（`worktrees/<NNN>`）
- 分配的任务列表（文件路径 + 改动描述 + 所属包）
- 命令格式：`pnpm -C worktrees/<NNN> -F @gocell/<pkg> typecheck && test`
- CLAUDE.md 关键约束（包边界、TS strict、tokens.css、Pinia、覆盖率）
- commit 格式：`<type>(<scope>): <描述>`，`<scope>` 为包名（不含 `@gocell/` 前缀）

每个 sub-agent 在自己任务上**串行**执行 Edit-Test Loop，完成后跑 `pnpm -C worktrees/<NNN> -F @gocell/<pkg> lint`（0 issues 才 commit）。

### 5.2 主 agent 汇总（所有并行 agent 完成后）

```bash
pnpm -C worktrees/<NNN> -w lint
pnpm -C worktrees/<NNN> -w typecheck
pnpm -C worktrees/<NNN> -w test --run
# 涉及 contract 改动时必跑：
pnpm -C worktrees/<NNN> codegen && git -C worktrees/<NNN> diff --exit-code packages/contracts/src/
```

任何一步红 → 回到 §5.0 不进阶段 6。

---

## 阶段 6：PR

```bash
git -C worktrees/<NNN> push -u origin <branch>   # dangerouslyDisableSandbox: true
gh pr create --title "..." --body "..."          # dangerouslyDisableSandbox: true
```

PR body 必含：Summary、`Refs: #<N>` 或 `Closes #<N>`、`ref: <project> <file>`（如对标了开源项目）、Test plan checklist、涉及包清单、是否触及 `packages/contracts/`（如触及，要解释代价/触发面）。

---

## 阶段 7：Review

**L1 / L2**：1 个 `reviewer` agent（gocell-web 六维度）。

**L3**：按 PR diff 净增删行数确定 `reviewer` 数。取数命令（求和 numstat）：

```bash
git -C worktrees/<NNN> diff --numstat origin/develop | awk '{i+=$1; d+=$2} END{print i+d}'
```

> 阶段 7 单独被调用（无 worktree）→ 仓库根执行 `git diff --numstat origin/develop | awk '{i+=$1; d+=$2} END{print i+d}'`。

**gocell-web 六维度**：

| 维度 | 关注点 |
|------|------|
| **Vue 模板正确性** | SFC 结构、props/emits/slots 类型、Composition API 用法、响应式语义、key/v-for 陷阱 |
| **TS 类型安全** | `strict` 合规、无 `any`、契约类型来源是否 `@gocell/contracts`、泛型边界 |
| **包边界 / 包架构** | 包间 import 是否走 `exports` 入口、是否存在深路径 / 反向依赖、`@gocell/contracts` 是否被手改 |
| **可访问性 (a11y)** | 键盘导航、ARIA、对比度、focus trap、screen-reader 文案 |
| **性能 / Bundle** | 路由懒加载、tree-shaking 完整性、unnecessary watcher / computed、虚拟列表用法、bundle 体积 |
| **设计 token / 产品一致性** | 是否只用 `tokens.css` 变量、是否符合 PRD §4 设计 DNA、i18n key 是否齐、与设计稿一致性 |

分档（区间左闭右开，边界值归更高档）：

| diff 行数 | reviewer 数 | 维度切分 |
|-----------|------------|---------|
| `diff < 200` | 0（主 agent 自审） | 不派发 sub-agent；主 agent 在自身上下文按 `.claude/agents/reviewer.md` 跑全六维度 |
| `200 ≤ diff < 600` | 2 | A：Vue 模板 + TS + 设计/产品；B：包边界 + a11y + 性能 |
| `600 ≤ diff < 1500` | 3 | A：Vue 模板 + TS；B：包边界 + 设计/产品；C：a11y + 性能 |
| `diff ≥ 1500` | 6 | 六维度各 1 agent 并行 |

`diff ≥ 200` 时并行启动 sub-agent，每个 prompt 自包含其负责维度；全部完成后主 agent 汇总去重 Finding 表（含 Cx 分级）。与 `.claude/skills/pr-review/SKILL.md` 阶段 3 分级对齐。

---

## 阶段 8：Fix

对 Cx1 / Cx2 + IN_SCOPE finding 派发 `vue-developer` 跑 `/fix <finding>`；Cx3 / Cx4 与 OUT_OF_SCOPE 收集到阶段 9。

---

## 阶段 9：人工确认

```
PR: #<编号> <URL>
已完成：TDD / 实施 / PR / review（实跑 reviewer 数：按 diff 1/2/3/6 自动） / Cx1-Cx2 fix / CI

未处理问题（需人工确认）：
| # | Finding | Cx | 建议方案 | 原因 |
|---|---------|----|---------|----|
```

---

## 约束

- `pnpm -w lint && typecheck` 0 issues 才 push；不 `--no-verify`；不 amend 已 push commit
- `git push` / `gh` / `pnpm install,add,publish` 用 `dangerouslyDisableSandbox: true`
- worktree merge 后提示用户手动 `git worktree remove`，不自动删除
- 文档 / 配置类 PR：阶段 4 跳过，但阶段 7 review 强化跨文件一致性 + 命令工具链准确性检查
