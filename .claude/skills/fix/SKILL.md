---
name: fix
description: "问题诊断与修复：验证 + 根因 + 复杂度分级 + 修复方案 + GitHub Issues 登记。当用户说'这个问题存在吗''帮我分析这个 bug''诊断一下这个模块''修复这个问题'时触发。支持单条与批量（review 报告）输入。"
argument-hint: "<问题描述|文件:行号|review 报告路径|#issue>"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion]
---

# gocell-web 问题诊断与修复

> `gh` 命令均 `dangerouslyDisableSandbox: true`；创建/查询前 `gh auth status`；issue 写入幂等（先 search 再 create）。**Backlog 真值源 = GitHub Issues**（label `backlog` + `priority/p0..p3`）。

---

## 输入解析

支持单条（自然语言 / `文件:行号` / `#NNN` 或裸数字 issue 号）或批量（review 文档路径 / `--from-review <stage>`）。

解析规则：
1. 含 `文件路径:行号` → 直接定位到代码
2. 含 GitHub issue 编号（`#720` 或裸数字 `720`）→ `gh issue view <num>` 解析（title / body / labels）
   - issue 不存在（404）→ 报错 `指定 issue #<num> 不存在` 并停止
   - issue 存在但缺 `backlog` label → 警告后继续，将其视为外部上下文（非 backlog 工作流）
3. 指向 review 文档（.md 文件含多条 findings）→ 进入**批量模式**
4. 自然语言 → 用 Grep/Glob 在代码库中定位相关代码

### 批量模式（review 报告）

当输入是 review 文档时：

1. 解析所有 findings（按 ID、文件、描述提取）
2. **按包聚类**（`@gocell/<pkg>` 各为一组；`apps/web/`、`tools/codegen/`、`docs/` 各一组）
3. **决定并发度**：

   | finding 数 | 并发 sub-agent 数 |
   |-----------|------------------|
   | ≤ 3 | 0（主 agent 直接处理） |
   | 4-9 | 2 |
   | ≥ 10 | 3 |

4. **Triage 并行**（subagent_type: `Explore`）：聚类后的组分发，每组完整执行阶段 1.1→1.3 + 2.4，返回结构化表。**同包必须分给同一 agent**（避免重复 Read + 防 fix 阶段写冲突）。Sub-agent prompt 自包含（finding 列表、当前分支 diff 摘要、CLAUDE.md 关键约束）。
5. 主 agent 汇总，输出状态/归属表：

   | 状态 | 归属 | 处理方式 |
   |------|------|---------|
   | CONFIRMED | IN_SCOPE | 在当前分支修 |
   | CONFIRMED | RELATED | 建议搭车修，标注"搭车" |
   | CONFIRMED | OUT_OF_SCOPE | 按 §沟通规则闸门输出 issue 建议命令 |
   | RESOLVED | — | 标注已修，跳过 |
   | CANNOT_VERIFY | — | 标注待确认，跳过 |

6. **只修 IN_SCOPE + RELATED**，按分析结果决策：
   - IN_SCOPE + Cx1 + 满足自动执行条件 → 直接修
   - IN_SCOPE + Cx2 → 执行推荐方案
   - IN_SCOPE + Cx3 / Cx4 → 只输出方案，标注"需人工决策"
   - RELATED + Cx1 / Cx2 → 搭车修，标注"搭车"
   - OUT_OF_SCOPE → 不修；按 §沟通规则闸门输出建议命令
7. **修复并行**（subagent_type: `vue-developer`）：按包聚类分发，并发数同步骤 3。每个 sub-agent 串行处理组内 finding（同包内串行避免写冲突），跑阶段 4.2 的 Edit-Test Loop。Cx1 + Cx2 都并行；Cx3 / Cx4 只输出方案不派发。
8. 主 agent 汇总修复结果，跑阶段 4.3 最终测试 + 4.6 git 收尾 + issue 闭合/创建。

---

## 阶段 1：问题定位

### 1.0 Backlog 关联检查

1. `gh issue list --label backlog --search "<关键词>" --state open --json number,title,labels` → 确认是否已登记
2. 命中 → `gh issue view <num>` 读取上下文
3. 未命中 → 记录；修复完成后在阶段 4.6 按 §沟通规则闸门处理

### 1.1 找到问题代码

按精度递进：明确路径 → Read；模糊描述 → Grep 类型/函数名 → Grep 错误码/i18n key → Agent(Explore) 调用图。三层均无果 → AskUserQuestion。

### 1.2 追踪调用链 + 数据流

从问题代码向上（调用方 / 父组件 / 路由 / store action）和向下（子组件 / Composables / API client）追踪。跨 3+ 包用 Agent(Explore)。同时追踪数据流：API → store → Composable → 组件 props → DOM。

### 1.3 确认问题是否存在

| 状态 | 含义 | 下一步 |
|------|------|--------|
| **CONFIRMED** | 问题真实存在，可复现 | → 阶段 2 |
| **RESOLVED** | 已被修复（给出证据：哪行、哪个 PR） | → 报告，结束 |
| **CHANGED** | 代码重构过，问题形态变化 | → 描述新形态，确认是否继续 |
| **CANNOT_VERIFY** | 无法确认（缺上下文 / 需运行时） | → AskUserQuestion 请求更多信息 |

输出含：状态 / 位置 / 调用链 / 数据流 / 问题描述。

### 1.4 复现测试（Reproduction Test First）

CONFIRMED 后、修复前，构造一个能**复现问题**的测试用例：

| 场景 | 操作 |
|------|------|
| 已有测试可稍改复现 | 修改已有测试 + 确认 FAIL |
| 需新写 vitest 单测 | `<file>.spec.ts` 新增 `it('reproduces #<NNN>', ...)` |
| 需 Playwright E2E 才能触发 | `tests/e2e/<feature>.spec.ts` 新增；标注 `RUNTIME_ONLY` 时跳过此步 |
| 视觉/样式回归 | 无法机器复现 → 标 `MANUAL_ONLY`，附复现步骤截图 |

运行确认 FAIL：`pnpm -F @gocell/<pkg> test --run -t "<test name>"`。

---

## 阶段 2：根因分析 + 复杂度分级

### 2.1 根因三维度

- **代码层面**：哪行代码、哪个设计决策导致
- **架构层面**：是否系统性（Grep 同模式，1 处=局部，3+=架构缺陷）。架构缺陷 → AskUserQuestion 局部修 vs 系统性重构
- **历史层面**：`git log -S "<片段>"` 搜同类已有修复，发现团队惯例避免退化

### 2.2 影响范围

直接 / 间接（列受影响文件）/ 同类（Grep 数量）

### 2.3 复杂度分级

> **Cx = 改动量 / 实现风险。** Cx1 = "容易修"，不代表"不重要"。IN_SCOPE / OUT_OF_SCOPE 由文件归属（2.4）决定，与 Cx 无关。

| 等级 | 判定 | 方案形态 |
|------|---------|---------|
| **Cx1 易修** | 改 1-2 个文件，不跨包，不改 `exports` | 直接修 |
| **Cx2 适中** | 改 3-5 个文件，跨 1-2 个包，`exports` 不变 | 最小修复 + 可选彻底方案 |
| **Cx3 复杂** | 改 5+ 个文件，跨 3+ 个包，或需改 `exports` / contract | 必须给三级方案（最小/彻底/重构） |
| **Cx4 架构级** | 需新增包 / 重构 store 拓扑 / 改变数据流方向 / 改 codegen 链路 | 只做方案设计，不直接执行 |

判定按顺序检查：
1. 修复涉及多少文件？（`Grep` 搜所有受影响调用点）
2. 是否需改 `@gocell/core` 的 `exports` 或 `packages/contracts/`（codegen 重跑）？
3. 是否需新增 Pinia store / 新增 i18n key 命名空间？
4. 是否影响路由表 / 全局守卫 / Axios 拦截器？
5. 同类问题在其他包是否重复出现？（1 处=局部，3+=系统性）

### 2.4 当前分支归属判定

判断问题是否属于**当前分支/PR 的修复范围**。默认当前分支处理。

**判定**：
1. `git diff --name-only origin/develop...HEAD` 获取当前分支改动文件列表
2. 对比 finding 涉及文件是否在列表中
3. 当前分支有关联 PR（`gh pr view --json title,body`）→ 检查 PR 描述是否包含该 finding ID 或关键词

**结果**：

| 结果 | 条件 | 下一步 |
|------|---------|--------|
| **IN_SCOPE** | finding 文件在 diff 中，或 PR 描述明确包含该 ID | 当前分支修 |
| **RELATED** | 文件不在 diff 中但与当前分支功能主题直接相关（同包遗留） | 建议搭车修，标"搭车" |
| **OUT_OF_SCOPE** | 完全不同的包 / 子系统 | 不在当前分支修；§沟通规则闸门 |

**快速规则**：当前分支 diff 包含 → IN_SCOPE；同包但 diff 外 → RELATED；不同包 → OUT_OF_SCOPE。

输出含：代码/架构/历史三维度根因、Cx、当前分支归属（含理由）、影响范围、历史修复。

---

## 阶段 3：修复方案设计

### 方案设计原则（贯穿 3.0-3.4；进入阶段 4 / 输出 Cx3+ 方案 / 批量汇总前强制自检）

- **彻底**：根因级修复，不留 TODO / FIXME / follow-up；2.2 列出的"同类"一并纳入
- **不向后兼容**：直接改签名 / 删字段 / 换实现，不留 deprecation 别名、shim、双路径
- **优雅简洁**：最少代码、最少抽象、最少新文件，不预设未来需求

不通过 → 修订；必须保留的违反项 → 显式列入"遗留 / 取舍说明"。默认走彻底方案；Cx2 最小修复仅在 3.2 明确"不能现在做"时启用，必须给升级窗口 + 按 §沟通规则闸门输出 issue 建议命令。批量"搭车修"同样适用。

### 3.0 对标参考查询（Cx2+ 必须执行）

Cx2+ 问题，**先查参考再动手**。三层按权威性递减：

1. **Vue / Pinia / Vue Router 官方文档**（含 Pitfalls / Cookbook）→ 有做法必须遵循
2. **AntD Vue / 关键依赖 Issues / RFC** → 检查已知陷阱
3. **对标项目**（Vben、Pure Admin、AntD Pro Vue 等）→ 参考，可偏离但须注明

**决策优先级**：层 1 > 层 2 > 层 3 > `WebSearch "vue 3 best practice <topic>"`

**何时跳过**：Cx1 全跳过；纯业务 bug 全跳过
**不可跳过**（即使 Cx2）：异步竞态、生命周期 / unmount 清理、SSR 边界、安全（XSS / CSP / token 处理）、a11y 焦点管理

---

### 3.1 方案分级

| 等级 | 方案数 | 形态 |
|------|--------|------|
| Cx1 | 1 | 直接修 |
| Cx2 | 2 | A 最小修复 + B 彻底方案 |
| Cx3 | 3 | A 最小 + B 彻底 + C 重构 |
| Cx4 | 设计文档 | 只输出方案，不执行 |

每方案须含：改动范围、原理、优缺点、遗留（仅最小修复）、预估改动量、参考来源（Cx2+ 必填）。

### 3.2 时机判断

**Q0：是否属于当前分支？**（2.4 优先）

| 归属 | 时机 |
|------|---------|
| IN_SCOPE | 当前 PR 修，进 Q1 |
| RELATED | 建议搭车，改动大可 defer |
| OUT_OF_SCOPE | 不修；§沟通规则闸门 |

**Q1：现在做还是后面做？**（IN_SCOPE / RELATED 继续）

| 推荐 | 判定 |
|------|---------|
| **现在做** | 安全漏洞 / 运行时崩溃 / 阻塞他人 / 改动 ≤ 50 行 |
| **本迭代做** | 有影响不紧急 / 改动 50-200 行 / 不阻塞 |
| **下迭代做** | 设计级问题 / 改动 200+ 行 / 需前置工作 |
| **记录不做** | 理论风险但实际不触发 / 修复代价远大于收益 |

**Q2：能不能现在做？** 检查已有 issue 依赖、活跃分支冲突、`exports` 消费方。

**Q3：最小修复有效期？** 给彻底方案的建议时间窗口。

### 3.3 详细修复计划

文件级改动清单 + 验证命令：`pnpm -F <pkg> typecheck`、`pnpm -F <pkg> test --run`、`pnpm -w lint`、`pnpm -F @gocell/web build`（涉及 bundle 影响时）、`pnpm codegen && git diff --exit-code packages/contracts/src/`（涉及 contract 时）。

### 3.4 执行决策

| 复杂度 | 条件 | 决策 |
|----|------|-----|
| Cx1 + IN_SCOPE + ≤2 文件 + 不改 `exports` / contract / 路由表 | 全满足 | **[AUTO-FIX]** 直接修 |
| Cx2 + IN_SCOPE + 能做 | — | 执行推荐方案 |
| Cx2 + 不能做（有前置） | — | 记录报告，标阻塞 |
| Cx3 / Cx4 | 任何 | 只输出方案，"需人工决策" |
| 任何 + OUT_OF_SCOPE | — | 不修，§沟通规则闸门 |

**不可自动执行**：异步 / 并发语义变更、`exports` 修改、新增依赖、数据流方向变更、Cx2+。

**仅以下用 AskUserQuestion**：测试失败且 4 轮回退仍无法修正；修复中发现新问题超出 scope。

### 3.5 执行前任务清单（阶段 3 → 4 门禁）

**用 TaskCreate 注册每项任务**，执行时 TaskUpdate 更新状态。

- 所有 finding 都建 task，OUT_OF_SCOPE 标注 `[→ 输出 issue 建议命令；等用户确认]`
- 单条 Cx1 IN_SCOPE → 跳过清单直接修；批量或 Cx2+ → 必须建
- 最后两项固定：`commit + push` + `闭合/创建 GitHub issues`
- 创建后立即执行，不等确认

---

## 阶段 4：执行修复

### 4.1 Commit 格式

在当前分支直接修改。Commit: `fix(<scope>): <问题简述>` + 根因 + 复杂度 + Refs + Co-Authored-By。
scope = 包短名（`access` / `audit` / `core` / `web` 等）。安全约束：只 add 修复文件（不 add -A）；不 amend。

### 4.2 Edit-Test Loop

> **批量并行**：4+ 条 finding 按批量模式步骤 7 派发 `vue-developer` sub-agent，下面循环在每个 sub-agent 内对其分组的 finding 串行执行；单条 / ≤3 条由主 agent 直接执行。

对每个任务：

1. **TaskUpdate → in_progress**
2. Read 目标文件
3. Edit / Write 修改代码
4. `pnpm -F @gocell/<pkg> typecheck` — 类型检查
5. `pnpm -F @gocell/<pkg> test --run -t "<test>"` — **立即跑相关测试**（含 1.4 复现测试）
6. 失败：
   - 当前编辑引入 → 立即修正，重回 3
   - 暴露后续依赖 → 记录，继续下一步
7. 通过 → **TaskUpdate → completed** → 下一任务

### 4.3 最终测试

```bash
pnpm -w lint
pnpm -w typecheck
pnpm -F @gocell/<pkg> test --run
# 涉及 contract：
pnpm codegen && git diff --exit-code packages/contracts/src/
# 涉及全局样式 / 路由 / 构建：
pnpm -F @gocell/web build
```

### 4.4 测试失败处理（分层回退）

| Round | 策略 |
|-------|------|
| 1-2 | 在当前方案上迭代修正 |
| 3 | `git stash` + 切换备选方案 |
| 4 | 回滚（`git checkout -- <文件>`），Cx1 标 ESCALATE，Cx2 降级最小修复标遗留 |

### 4.5 验证修复

重新执行阶段 1 的定位，确认：原问题代码已被替换 / 数据流已正确保护 / 测试覆盖了问题场景。

### 4.6 Git 收尾

**步骤 1：提交分支代码**
1. `git add` 修复涉及的代码文件
2. 按 4.1 关联模式 commit → push → PR

**步骤 2：更新 GitHub backlog issues**

写入前 `gh issue list --label backlog --search "<关键词>"` 查重。`gh issue close` / `gh issue edit` 自动执行；`gh issue create` 按 §沟通规则闸门走。

**Priority 决定**（CLI 创建 issue 必须显式贴 `--label priority/pX`）：

- review finding 含 `[P0]/[P1]/[P2]/[P3]` → 直接采用
- /fix 派生新 finding：默认 **`priority/p2`**（常规债务）
- `priority/p0` 红线：仅 incident-driven（线上故障 / 数据完整性 / 安全 CVE），`/fix` 不默认 P0；如确属红线 → AskUserQuestion 确认升级

| Finding 状态 | /fix 行为 | 命令模板（user 确认后） | body / comment |
|------------|---------|---------------------------|----------------|
| IN_SCOPE 已修 + 对应已有 issue | **自动执行** | `gh issue close <num> --reason completed --comment "Fixed in PR #<NNN>"` | — |
| IN_SCOPE 已修 + 无对应 issue | **输出建议命令** + AskUserQuestion | `gh issue create --label backlog --label priority/pX --title "..." --body-file <tmp>` → 立即 `gh issue close <new> --comment "..."` | body 含 `Found and fixed in PR #<NNN>` |
| OUT_OF_SCOPE finding | **输出建议命令**，不自动创建 | `gh issue create --label backlog --label priority/pX --title "..." --body-file <tmp>` → `gh issue edit <new> --add-label pkg/<name>,batch/<N>` | body 含：现状 / 修复方向 / 涉及文件 / 触发条件 / 来源 |
| /fix 中发现新问题 | **输出建议命令**，不自动创建 | 同 OUT_OF_SCOPE | body 含 `Discovered via /fix #<original>` |

完成后 **TaskUpdate → completed**。

---

## 阶段 5：输出 + 验证

- 诊断报告（未修）
- 修复报告（已修）
- 批量验证（review 报告）

**Backlog 验证**（4.6 已执行，此处 `gh` 复核）：
- FIXED finding 对应 issue 已 closed + comment 引用了 PR 编号
- OUT_OF_SCOPE finding：按 §沟通规则闸门输出建议命令，必须含 `priority/pX` + `pkg/<name>` 或 `batch/<N>` 至少一个分类 label
- /fix 派生新问题：同 OUT_OF_SCOPE；body 草稿含 `Discovered via /fix #<original>`

---

## 沟通规则

**默认按分析结果自动决策。** 仅以下情况用 AskUserQuestion：
- 无法定位问题代码
- 测试失败且 4 轮回退后仍无法修正
- 修复过程中发现新问题超出原始 scope
- Cx3 / Cx4 用户追加了 `--auto` 参数（矛盾，需确认）
- **任何 `gh issue create` 调用前**（OUT_OF_SCOPE / /fix 派生新问题 / 4.6 表格中"输出建议命令"行）：先输出建议命令 + body 草稿，再 AskUserQuestion "是否帮你 run 此命令？"。用户拒绝 → 留命令在最终报告供手工 run，/fix 不自动 create
- `priority/p0` 红线升级（incident-driven 或安全 CVE）
