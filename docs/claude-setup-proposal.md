# gocell-web · Claude 协作体系适配方案

> 起草：2026-05-23 · 状态：**已落地（2026-05-23）**——本方案 §3 全部落盘，见 `CLAUDE.md` + `.claude/{skills,agents,rules}/`
> 参考：`../gocell/CLAUDE.md`、`../gocell/.claude/{skills,agents,rules}/`
> 立足：本仓库 PRD（`docs/prd/PRD.md` v1.1，Vue 3 + Vite 5 + pnpm monorepo）+ 并行 AI 隔离设计（`docs/design/parallel-ai-cell-mapping.md`）
> 本文档保留为决策追溯（§5 七问的取舍记录）；现行规则以 `CLAUDE.md` + `.claude/rules/gocellweb/*.md` 为准

---

## 0. 核心判断

**这不是把后端的 .claude/ 整套搬过来。** 后端那套是为 Go 多层架构 + spec-kit + sonar + nightly archtest 量身做的；前端工具链完全不同（pnpm/vite/vitest/playwright/eslint），而且代码还**没开始写**——现在搬太多反而会绑死后续选型。

策略：**保留方法论 + 流程骨架，把工具链/路径/产物全部重写到前端语境**。原文件不是模板，是参考。

---

## 1. 已盘点的后端资产

| 类别 | 后端文件 | 一句话用途 |
|---|---|---|
| 主规则 | `CLAUDE.md` | 分层依赖、Cell/Slice 规则、Go 规范、AI-robust 治理章程、sandbox 提权约定 |
| skills | `ship/` | 全流程实施：探索→计划→worktree→TDD→PR→review→fix |
| skills | `fix/` | 问题诊断+根因+Cx 分级+修复+backlog 登记 |
| skills | `pr-review/` | 按 diff 行数自动分级派 reviewer agent 跑六维度审查 |
| skills | `git-worktree/` | worktree 编号、基准分支、`-C` 路径用法约定 |
| skills | `sonar-scan/` | 拉 SonarCloud 静态扫描结果 |
| skills | `speckit-*` (8 个) | github spec-kit 全套（constitution/specify/clarify/plan/tasks/implement/analyze/checklist） |
| agents | `architect`, `developer`, `reviewer`, `explorer`, `kernel-guardian`, `doc-engineer`, `devops`, `product-manager`, `project-manager`, `roadmap` | 角色化子代理，opus/sonnet 分级 |
| rules | `rules/gocell/{ai-robust,cell-patterns,contract-fanout,error-handling,eventbus,observability,runtime-api,api-versioning,go-standards}.md` | 领域规则手册，被 CLAUDE.md / agents 引用 |

---

## 2. 适配决策矩阵

### 2.1 直接吸收（流程骨架 + 方法论）

| 后端项 | 前端化做法 |
|---|---|
| `ship` 流程的 7 阶段（探索→计划→worktree→TDD→实施→PR→review→fix） | 完全保留。`TDD` 改为「先写 Vitest 单测 / Playwright 冒烟」；`go build/test` 改为 `pnpm -F <pkg> typecheck && pnpm -F <pkg> test` |
| `pr-review` 按 diff 行数派 reviewer | 完全保留分级思路。维度从「Go 六维」改为「**Vue 模板正确性 / TS 类型安全 / 包边界（cell/slice 隔离）/ 可访问性 / 性能（bundle/渲染）/ 设计 token 一致性**」六维 |
| `fix` 的 Cx1/Cx2/Cx3 复杂度分级 + 根因优先 + backlog 登记 | 保留。backlog 走 GitHub Issues（前端项目不另起 backlog 文档） |
| `git-worktree` 约定（编号 / `-C` 路径 / 基于 develop） | 保留。命令从 `go -C` 换成 `pnpm -C` |
| `ai-robust.md` 的 Hard/Medium/Soft 三档 enforcement 评级 | 保留思想。Hard = TS 类型 + ESLint rule + `package.json#exports`；Medium = vitest 用例；Soft = 文档约定（**沿用「Soft 严禁立项」规则**） |
| 「Sandbox 提权」清单（`git push/pull`, `gh`） | 直接复制，加入 `pnpm publish`（如有）和 `gh` 全家桶 |

### 2.2 改造吸收（需要重写但角色保留）

| 后端 agent | 前端对应 | 主要改写 |
|---|---|---|
| `architect` (opus) | **architect** | 关注点从「kernel/runtime/adapters 分层」改为「packages/<cell> 边界 + `package.json#exports` + 跨包依赖图」 |
| `kernel-guardian` (opus) | **boundary-guardian** | 验证 `@gocell/contracts` 只读（由 codegen 生成）、cell 之间不越权 import、tokens.css 不被业务包覆盖 |
| `developer` (sonnet) | **vue-developer** | 工具链全换；强制 `<script setup lang="ts">`、Composition API、Pinia store 规范 |
| `reviewer` (sonnet) | **reviewer** | 六维度重定义（见 2.1） |
| `explorer` (sonnet) | **explorer** | 对标对象换：`vbenjs/vue-vben-admin`、`vue-pure-admin`、Ant Design Pro、Vercel/Linear 的 console；保留 WebFetch 拉源码 + 提取设计的工作模式 |
| `doc-engineer` (sonnet) | **doc-engineer** | 产物换：组件 API（vue-component-meta）、Storybook（如启用）、`docs/prd` 同步、BR 文档更新 |
| `devops` (sonnet) | **devops** | docker-compose（前端镜像 + nginx 反代后端）+ GitHub Actions（pnpm cache / vitest / playwright / preview deploy） |
| `product-manager` / `project-manager` / `roadmap` | 保留同名 | 内容改为对齐 PRD §10 的 7 个 MVP Batch 节奏 |

### 2.3 暂缓 / 不引入

| 项 | 原因 |
|---|---|
| `speckit-*` 全套 8 个 skills | spec-kit 是 `.specify/` 驱动；本仓库 PRD 已写好且采用「PRD + BR + 设计稿」三件套模式，再叠一层 spec-kit 是重复治理。**Batch 1+ 如果觉得需要再补**，先空着 |
| `sonar-scan` skill + `tools/findings/static-scan/` | 前端静态分析已经有 ESLint + tsc + vue-tsc + (可选) `knip`/`madge`/`depcheck`；Sonar 对前端价值不如对 Go 大。MVP 不引入，等 SonarCloud 配置好再说 |
| `archtest-nightly` | 后端用 archtest 做 Go 包依赖验证；前端的等价物是 `eslint-plugin-boundaries` / `dependency-cruiser` / `madge`，**走 PR CI 直跑**而不是 nightly。不需要单独的 skill |
| 后端 `rules/gocell/{error-handling,eventbus,observability,runtime-api,api-versioning,contract-fanout,cell-patterns}.md` 的具体内容 | 全部是 Go/后端语义。保留**文件骨架和命名习惯**，内容全部重写为前端版本（见 §3.4） |

---

## 3. 落地清单（建议 Batch 0 的一部分）

### 3.1 `CLAUDE.md`（根目录，必出）

按 PRD 倒推，要写清楚：

1. **协作总则**：PRD/设计稿/BR 是真相源；修改前先读这三处
2. **架构约束**：apps/web + packages/<cell>（@gocell/core/access/audit/config/observability/contracts/devboard）+ tools/codegen；**包间只通过 `exports` 暴露的入口互相依赖**
3. **依赖规则**（仿后端三段式）：
   - `@gocell/contracts` 由 codegen 生成，**只读**，业务包不得手改
   - `@gocell/core` 不依赖任何业务 cell；只提供 UI 壳 + Composables + tokens
   - `apps/web` 可以依赖所有 `@gocell/*`，反向不允许
4. **Cell/Slice 规则**：每个 `packages/<cell>/` 必须有 README 说明 cell 域、对外 exports、依赖的 contract；slice 粒度 = PR 粒度（同 backend）
5. **前端编码规范**：Vue 3 `<script setup lang="ts">`、Composition API、Pinia 模块化、API 调用走 `@gocell/<cell>/api`、样式用 `tokens.css` 变量、禁止 inline color
6. **测试规范**：新增/修改代码 vitest 覆盖率 ≥ 80%；`@gocell/core` ≥ 90%；Playwright 仅冒烟
7. **修改前流程**：`Read` 目标文件 → `Grep` 已有实现 → 改完跑 `pnpm -F <pkg> typecheck && test` → 涉及多包跑 `pnpm -w lint`
8. **AI-robust 治理章程**：Hard/Medium/Soft 三档 + Soft 禁止立项；并行 AI 工作必须落在不同 `packages/<cell>` 内（引用 `docs/design/parallel-ai-cell-mapping.md`）
9. **Sandbox 提权清单**：`git push/pull/fetch`、`gh *`、`pnpm publish`、`docker *`
10. **参考框架表**（仿后端）：组件库对标 antd / pro-vue / vben-admin；状态对标 pinia 官方；监控对标 grafana onCall console；设计对标 Linear / Vercel

### 3.2 `.claude/skills/`（必出 4 个）

| skill | 来源 | 主要改写点 |
|---|---|---|
| `ship/` | 后端 ship | 阶段 4 TDD → vitest 优先；阶段 5 改完跑 `pnpm typecheck && test`；阶段 7 reviewer 维度替换 |
| `pr-review/` | 后端 pr-review | 维度六换六（见 2.1）；diff 行数阈值保持 200/600/1500 不变 |
| `fix/` | 后端 fix | Cx 分级保留；backlog 入口走 GitHub Issues 而不是 `docs/backlog.md` |
| `git-worktree/` | 后端 git-worktree | 命令前缀换 `pnpm -C`；编号区间约定保留 |

### 3.3 `.claude/agents/`（建议第一批 5 个，其余按需补）

立即建：
- `architect.md`（opus）
- `boundary-guardian.md`（opus，前端版 kernel-guardian）
- `vue-developer.md`（sonnet）
- `reviewer.md`（sonnet，六维度前端版）
- `explorer.md`（sonnet）

按需补（Batch 2+）：
- `doc-engineer`, `devops`, `product-manager`, `project-manager`, `roadmap`

### 3.4 `.claude/rules/gocellweb/`（命名空间换成 gocellweb，文件按需）

第一批写 3 篇就够：
- `ai-robust.md`（Hard/Medium/Soft + 并行 AI 隔离约定）
- `frontend-standards.md`（合并后端 `go-standards.md` 的角色：TS strict、命名、目录、Pinia、Composables、错误处理、a11y、i18n key 规范）
- `package-boundaries.md`（合并 `cell-patterns.md` + `contract-fanout.md` + `api-versioning.md`：包间 exports、契约只读、版本号变更触发面）

Batch 2+ 再补：
- `observability.md`（OTel browser SDK + 前端日志 + 错误上报，对应 BR-003）
- `design-tokens.md`（tokens.css 使用约定 + ant-design ConfigProvider 接线）

### 3.5 `.claude/settings.json`（用户已圈定不在本次范围，**留作 Batch 0 末再独立讨论**）

只先约定一句：**不在本方案内自动落地任何 hook / 权限**；待 CLAUDE.md 与 skills 跑通后单独提案。

---

## 4. 与 PRD 节奏的对齐

PRD §10 列了 7 个 MVP Batch，本方案建议节奏：

| 时机 | 动作 |
|---|---|
| **Batch 0 启动前** | 落地本方案的 §3.1 + §3.2 + §3.3 五个 agent + §3.4 三篇 rule。**让 Batch 0 的人就有完整 Claude 协作环境** |
| **Batch 0 末（monorepo 骨架就绪后）** | 补 `.claude/settings.json`（含 lint/typecheck pre-commit hook）+ `boundary-guardian` 的实际校验脚本 |
| **Batch 1 末** | 第一次 retro，按实际使用情况增删 skill / agent / rule |
| **Batch 3 之后** | 补 `doc-engineer` / `devops` / `observability.md`，对接 BR-003 上线后的 LGTM 栈 |

---

## 5. 待你确认的取舍点

| # | 取舍 | 我建议 |
|---|---|---|
| Q1 | spec-kit 全套 8 个 skill 要不要保留？ | **不留**，PRD + BR 已经够 |
| Q2 | sonar-scan 要不要保留？ | **不留**，等 SonarCloud 配好再说 |
| Q3 | agent 第一批 5 个够不够？ | 够。doc/devops/pm/roadmap 等需要时再补 |
| Q4 | rules 命名空间用 `gocellweb` 还是 `gocell-web`（带横线）？ | **`gocellweb`**（与包名 scope `@gocell` 风格一致，无横线） |
| Q5 | CLAUDE.md 写中文还是中英混排？ | **中文为主**（与后端 CLAUDE.md 风格一致；TS/CLI 命令保留英文） |
| Q6 | `.claude/settings.json` 是否本次一起落地？ | **不**。先跑通规则与 skill，hook/权限单独讨论 |
| Q7 | 是否要建 `agent-memory/` 目录（后端有）？ | **不建**。该机制后端也少用；前端用 `auto memory` 已够 |

---

## 6. 我接下来要做的

**等你对 §5 七个 Q 给反馈**。confirm 后我会按 §3 顺序产出：
1. `CLAUDE.md`
2. `.claude/skills/{ship,pr-review,fix,git-worktree}/SKILL.md`
3. `.claude/agents/{architect,boundary-guardian,vue-developer,reviewer,explorer}.md`
4. `.claude/rules/gocellweb/{ai-robust,frontend-standards,package-boundaries}.md`

每个文件落地前再贴关键差异 diff 让你确认，不会一口气写完不让你看。
