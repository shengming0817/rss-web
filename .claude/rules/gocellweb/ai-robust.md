# AI-robust 治理章程

> 第一性原理：gocell-web 主要实施者是 AI（Claude Code）。工程治理目标必须从"对人友好"转为 **AI-robust**——违反不可表达 / 机制不可绕过 / 字面约定全部消除。
>
> 本文件是约束 enforcement 的权威真值源。原则在此终结，不向 ADR / 代码 "详见"；落地实例活在代码 + lint 配置，本文不复制也不指向。

## 适用范围

本章程适用于「新增 / 修改约束 enforcement 机制」：

- TypeScript 类型系统（`strict`、branded type、`Result<T,E>`、契约类型）
- 包结构强制（`package.json#exports`、`workspace:*`、`pnpm-workspace.yaml` catalog）
- ESLint rule（`no-restricted-imports`、`import/no-internal-modules`、自定义 plugin）
- 构建期断言（vitest setup、CI step `pnpm codegen && git diff --exit-code`）
- 运行期 invariant（`assertNever` / Zod schema 在边界校验）

**不在范围**：日常实施任务（加页面 / 加字段 / 修 bug / refactor）；review finding 中的 bug 修复类。

## AI-robust 三档分级

| 档 | 定义 | 典型载体 | AI 可绕过性 |
|---|---|---|---|
| **Hard** | 违反不可表达 | TS type / `package.json#exports` / sealed class / codegen + `git diff --exit-code` | 0 |
| **Medium** | 违反需 runtime guard 或 lint 跨规则 cross-validate | ESLint custom rule / vitest assertion / `assertNever` | 低 |
| **Soft** | 字面注释 / 命名 convention / 文档约定 / 手维护 allowlist | review 凭眼力 / `// TODO` 注释 / README 段落 | **高** |

## 载体决策原则

新增 enforcement 按下列优先级选载体：

1. **codegen + `git diff --exit-code`**——单源（后端 schema / TS 定义）→ 派生执行体；CI 跑 diff 校验未手改（Hard）
2. **TS type system**——`branded type` / discriminated union / `as const` 让违反不可表达（Hard）；契约 / 错误码 / route name 全走类型化
3. **`package.json#exports` 收口**——包私有路径不出现在 `exports`；消费方深路径 import 即编译失败（Hard）
4. **ESLint 平铺兜底**，按真值类型选 plugin：
   - 路径级 import ban → `eslint-plugin-import` `no-restricted-imports` / `no-internal-modules`
   - 跨包归属 / 反向依赖 → `dependency-cruiser` 或 `eslint-plugin-boundaries`
   - Vue 模板 → `eslint-plugin-vue` recommended + a11y plugin
   - 自定义规则 → 写 ESLint plugin（必须配反向自检测试，断言其在合规代码上 0 命中）
5. **vitest setup + runtime guard**——`assertNever(x)` / `invariant(...)` 在边界校验类型穷尽 / 数据形状

### 工具选定后强制盲区自检

作者在新增 ESLint rule / dependency-cruiser rule 文件顶部 comment 列出该规则不覆盖的 AST / 数据形态，并对每项加反向自检测试（断言其在合规代码上 0 命中）。盲区清单 + 反向自检测试是 Hard / Medium 评级的**前置举证材料**。

### 立项硬门槛

**≥ Medium。Soft 形态严禁立项**——纯靠口头规则的约束不立。要么有 Hard / Medium 兜底，要么不写。

### Soft → Hard 改造方向

- 字符串注释豁免 → 类型化 marker（`type AllowAny = { __allow: 'reason' }`）
- 命名 convention → ESLint rule + 反向自检
- 手维护 allowlist → `package.json#exports` 自动暴露
- README 段落 → CI step 真跑验证

## 并行 AI 隔离

多 AI agent 并行实施时**必须落到不同 `packages/<pkg>/`**；同包内并行受 `allowedFiles` 约束（同文件冲突归同一 batch / agent）。

| 隔离维度 | 机制 |
|---|---|
| **物理** | git worktree（`worktrees/<NNN>/`）；详见 `.claude/skills/git-worktree/` |
| **逻辑** | pnpm `workspace:*` + 每包唯一 `src/index.ts` + `package.json#exports` 收口 |
| **契约** | 跨包改动必须经 contract 类型 + request client；PR 描述必标"涉及包清单" |
| **冲突预防** | 同文件归同一 agent；跨包改动优先按包拆 PR；不让两个 agent 同时碰一个包 |

详细规则见 `docs/design/parallel-ai-cell-mapping.md` §3。

## Review checklist（新增 enforcement 的 PR）

1. 选了哪一档（Hard / Medium）？**Soft → 拒绝立项**
2. 载体是否在「载体决策原则」优先级表中？偏离写明理由
3. 盲区自检测试是否齐？反向自检是否真跑 0 命中？
4. 是否补了配套文档（rule 名 + 适用范围 + 例外机制）？
5. 是否会触发误报？误报率 > 5% 必须给豁免机制
