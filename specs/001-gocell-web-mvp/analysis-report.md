# speckit-analyze — 跨工件一致性报告

**范围**：spec.md / plan.md / tasks.md（+ research.md / data-model.md / constitution v1.0.0）
**模式**：只读，不改工件；给出发现 + 建议修正（须人工批准后执行）。
**日期**：2026-05-29

## A. 覆盖映射（FR/SC → tasks）

| 需求 | 任务 | 状态 |
|---|---|---|
| FR-001..003（monorepo/exports/catalog） | T001-T003 | ✅ |
| FR-004（codegen 只读） | T010-T011 | ✅ |
| FR-005（边界 ESLint） | T022 | ✅ |
| FR-006（token/主题） | T012-T014 | ✅ |
| FR-007（Layout 壳） | T019 | ✅ |
| FR-008（i18n/错误映射） | T015 | ✅ |
| FR-009（axios 拦截器） | T016 | ✅ |
| FR-010（auth store/`<Can>`/PDP） | T017-T018 | ✅ |
| FR-011（守卫） | T020 | ✅ |
| FR-012（快捷键） | T021 | ✅ |
| FR-020..022（first-run/login/oracle-safe） | T103-T106 | ✅ |
| FR-030（identities） | T202-T205 | ✅ |
| FR-031..033（policies/`<Can>`/占位） | T303-T306 | ✅ |
| FR-040..042（audit/config/flags） | T402-T404 | ✅ |
| FR-050..051（cells） | T502-T506 | ✅ |
| FR-060..063（devtools） | T601-T604 | ✅ |
| FR-070..071（landing/observe） | T701-T702 | ✅ |
| FR-080..081（占位/i18n） | T801, 各占位任务 | ✅ |
| SC-001..010 | 各 batch 验收 + T802-T803 | ✅ |

**覆盖结论**：所有 FR/SC 均有对应任务，无孤儿需求、无无主任务。

## B. 发现（按严重度）

### CRITICAL
- **C1 — 基础设施包反向依赖业务包（违宪原则 I）**。三份探索的示例代码均在 `@gocell/request` 内 `import { useAuthStore } from '@gocell/access'`。
  - 影响：违反单向依赖 + 制造循环依赖（R15）。
  - 处置：**已在 plan.md「强制修正项」+ research §5/§7 + tasks T016 落地为 `setupAxios({getToken,onRefresh,onAuthFail})` 依赖注入**。判定为已消解，落地必须遵守。

### HIGH
- **H1 — access token 存储矛盾**。测试探索示例用 `useStorage('gocell:tokens')`（localStorage）；安全探索要求 access token 仅内存。
  - 处置：以安全结论为准（constitution §VIII / research §7.1 / tasks T017 已写"不入 localStorage"）。测试示例仅作 API 用法参考。判定为已消解。
- **H2 — refresh token 存储待后端确认**。理想 httpOnly cookie，但当前契约在 body 返回。
  - 处置：登记为 NEEDS CLARIFICATION（plan + contracts/README）。不阻塞 Batch 0-6；Batch 1 落地前需后端确认，否则退化为内存 + 静默 refresh。**保留为开放项**。

### MEDIUM
- **M1 — `<Can>` 依赖 BR-004 §4.1 `/access/decide` 未交付**。Batch 3 实数据被阻塞。
  - 处置：tasks T306 用契约 stub + 显式标注；不阻塞页面骨架。可接受。
- **M2 — Batch 7 依赖 BR-001/002/003 后端交付**。时间风险。
  - 处置：Batch 7 排在最后且可后置；landing 在 BR 未达时显示占位。可接受。
- **M3 — `/cells` 数据源未决**（静态 cell.yaml vs 新端点）。
  - 处置：MVP 取静态派生（T502），后续可换。已记 spec Assumptions。可接受。

### LOW
- **L1 — catalog 版本号是探索建议值**（vue 3.4 等），落地取最新稳定。research §1 已注明。
- **L2 — Cell detail tab 数量描述**：PRD §5 标"10 tabs"，明细列了 12 个名字。tasks T504 按明细列全。建议实现时以明细为准，PRD 文案小笔误不阻塞。
- **L3 — AI BottomBar** 属设计稿要求的占位，PRD §5.3 列为 MVP 占位；tasks T019 含。一致。

## C. 宪法对齐

| 原则 | 工件是否满足 | 备注 |
|---|---|---|
| I 分层 | ✅（C1 已消解） | request 依赖注入 |
| II Contract 真相 | ✅ | codegen + CI diff |
| III 包边界 | ✅ | exports + ESLint（T022） |
| IV 测试先行 | ✅ | 每 batch "Tests for" 段先于实现 |
| V 设计 DNA | ✅ | tokens 100% 复用 |
| VI 权限 UX | ✅ | fail-closed |
| VII 后端零阻塞 | ✅ | 占位显式标记 |
| VIII 安全 | ✅ | H1/H2 已处理/登记 |
| IX 简约增量 | ✅ | 按 batch 独立上线 |

**红线**：无 RL-01..RL-12 违反（C1 即 RL-03 风险，已结构性消解）。

## D. 歧义 / 欠规格项（需澄清，均不阻塞 Batch 0）
1. refresh token httpOnly cookie 是否支持（H2）。
2. `/access/decide` 交付时间（M1）。
3. BR-001/002/003 交付时间（M2）。
4. `/cells` 是否新增端点（M3）。

## E. 结论
- **可进入实施**：spec/plan/tasks 一致、可追溯、宪法对齐；唯一 CRITICAL（C1）已在计划层结构性消解。
- **门控开放项**：H2/M1/M2 为对后端的确认项，建议在对应 batch 启动前与后端对齐；Batch 0 不受阻。
- 建议：录入 epic 时把 4 个澄清项作为 epic 描述的 "Open Questions" 一并登记。

---

## F. 依赖顺序专项审计（2026-05-29，多 agent + 对抗式验证）

针对「任务顺序依赖是否完整」做了 5 维度并行审计（task 拓扑 / PR DAG / 跨工件一致性 / 隐式依赖 / 整体缺失），共 31 条候选发现，每条由独立 verifier **默认尝试反驳**：确认 **7 真 / 24 反驳**。

**核心结论**：依赖图**结构健全**——无环、无前向引用（PR 依赖均指向更低编号），骨干链（B0 BLOCKS 全部 → B1 → B2/3/4 并行；B5/6 仅依赖 B0；B7 依赖 B0+BR）在 plan/tasks/issue/pr-breakdown 四套工件方向一致。7 处真问题**全部为标注/一致性级**，非结构性断裂，已修正：

| # | 维度 | 严重度 | 问题 | 修正 |
|---|---|---|---|---|
| 1 | task-order | medium | Batch 0「Tests for」段排在实现之后，违反全文 TDD 顺序、与本报告 C 表自述矛盾 | tasks.md Phase 2 重排：T023 测试基建 → T024-T028 测试 → T010-T022 实现；保留 ID 稳定 |
| 2+4 | pr-dag+cross | medium | PR-18↔B4：依赖列写硬依赖(PR-17,14,13)，与 4 工件「弱依赖/可并行」及并行图自相矛盾 | 统一为**软依赖**：PR-18 依赖改 PR-17 + 软依赖 PR-13/14 脚注（未达占位降级）；图保持无 B4 实线边 |
| 3 | pr-dag | low | PR-14/PR-15 同属 `@gocell/config` 却标「可并行，分属同包不同文件」 | pr-breakdown + issue#15：PR-14→PR-15 同 worktree 串行（共享 routes/index 出口） |
| 5 | completeness | low | BR-004 外部依赖未在 tasks「Dependencies」段建模（仅建了 BR-001/2/3） | tasks.md 新增「外部后端依赖（BR）」表，区分软(BR-004)/硬(BR-001/2/3) 门 |
| 6 | completeness | low | T505 对 B4 的弱依赖未落任务级 | T505 行内补「弱依赖 T402/T403，未就位占位降级」 |

**被反驳（确认非问题）的高价值项**：
- *PR-04 需 PR-05 的 i18n 框架才能绿* → 否：拦截器只附 `errors.{code}` key 字符串，翻译延迟到组件 `t()`（research §5），PR-04 独立可绿。
- *边界 lint(T022) 太晚拦不住 C1 反向 import* → 否：宪法定其「Batch 0 末期」一致，且 C1 主控是 `setupAxios` DI **结构性消解**（根本不写该 import），lint 仅双保险。
- *T018 跨 core+access 标 [P] / 与 T017 同包冲突* → 否：`<Can>` 拆两层是单一交付物（PR-04 捆绑、同 worktree），proposedFix 的「T018b 串行于 T017」会引入**虚假依赖**（两者实际独立）。

上述澄清已就近补入 tasks.md（T014/T016/T018/T020/T022 行注）。**最终判定：任务顺序依赖完整、可执行**；剩余仅为对后端 BR 的软/硬交付门，已显式登记。
