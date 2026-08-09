---
paths:
  - "apps/web/package.json"
  - "packages/**/package.json"
  - "apps/web/**/*.{ts,tsx,vue}"
  - "packages/**/*.{ts,tsx,vue}"
  - "tools/codegen/**/*"
  - "pnpm-workspace.yaml"
---

# 包边界规则

## 包依赖矩阵

| 包 | 允许依赖 | 严禁依赖 |
|----|---------|---------|
| `@gocell/contracts` | （由 codegen 派生，无 ts 运行时依赖） | 任何业务 / 框架代码（纯类型包） |
| `@gocell/shared` | 标准库 + 第三方工具（lodash-es 之类）| 任何 `@gocell/*` |
| `@gocell/core` | `@gocell/shared`、Vue、Pinia、Vue Router、AntD Vue、vue-i18n | 任何业务 cell（`access`/`audit`/...） |
| `@gocell/request` | `@gocell/shared`、`@gocell/contracts`、axios | 业务 cell、`@gocell/core` |
| `@gocell/access` | `@gocell/core`、`@gocell/shared`、`@gocell/contracts`、`@gocell/request` | 其他业务 cell |
| `@gocell/audit` | 同上 | 同上 |
| `@gocell/config` | 同上 | 同上 |
| `@gocell/observability` | 同上 | 同上 |
| `@gocell/devboard` | 同上 + `@gocell/access`（仅消费 PDP client） | 其他业务 cell |
| `apps/web` | 所有 `@gocell/*` | — |
| `tools/codegen` | 标准库 + json-schema-to-typescript | `@gocell/*` |

## `package.json#exports` 收口

每个 `packages/<pkg>/package.json` 必须有：

```jsonc
{
  "name": "@gocell/<pkg>",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./composables": "./src/composables/index.ts",
    "./stores": "./src/stores/index.ts"
    // 业务包按需暴露 ./components / ./api / ./types 等
  },
  "files": ["src", "dist"]
}
```

约束：
- `exports` 必须显式列出每个对外入口；不写 `./*` 通配
- 私有路径（`./src/internal/`、`./src/utils/private`）**不出现**在 `exports`
- `apps/web` 或其他包消费时只用 `exports` 暴露的子路径，**禁** `import x from '@gocell/foo/src/internal/x'`
- ESLint `no-restricted-imports` 双保险拦截深路径

## `@gocell/contracts` 只读约束

- 由 `tools/codegen` 跑 `json-schema-to-typescript` 从 `../gocell/contracts/http/**/*.schema.json` 派生
- 业务包**不得手改** `packages/contracts/src/` 任何文件
- CI 守门：
  ```bash
  pnpm codegen
  git diff --exit-code packages/contracts/src/
  ```
  非 clean → 红，PR 不可合
- 后端 schema 演进 → 前端 `pnpm codegen` 后产生 diff，diff 合入与后端 PR 联动；diff 引起的破坏性变更走「破坏性变更协议」

## 跨包通信规则

### 业务包之间不直接 import

| 错误 | 正确 |
|---|---|
| `import { useAuditStore } from '@gocell/audit'` 在 `@gocell/access` 内 | 不允许。需要 audit 数据 → 通过 PDP / API 拿 |
| `@gocell/access` 直接 import `@gocell/config` 的 store | 不允许。配置数据 → 经 `@gocell/config` 提供的 contract 类型 + `@gocell/request` client |

### 允许的横向消费

- `<Can>` 组件 + `useDecision()` 注入点（`PDP_INJECTION_KEY`）归属 `@gocell/core`（UI 壳，全包可消费）；PDP client 实现（`createPdpClient`）归属 `@gocell/access`，由 `apps/web` 装配层经注入点 `provide` 注入（PRD §9/§211）
- `@gocell/devboard` 可依赖 `@gocell/access`（消费其 PDP client 能力）；这是设计性例外，因为 devboard 内的所有页面都需要 PDP。`<Can>`/`useDecision` 本身来自 `@gocell/core`
- 其他横向需求 → 先拆到 `@gocell/core` 或 `@gocell/shared`

### HTTP 单点

- 所有 HTTP 调用必须经 `@gocell/request` 暴露的 axios 实例（含 401 拦截、refresh、错误 envelope 映射）
- 业务包不 `import axios`、不 `new XMLHttpRequest`、不裸 `fetch`
- Grep 检测命令：`rg "^import .* from ['\"]axios['\"]" packages/{access,audit,config,observability,devboard,core,shared}/`

## 破坏性变更协议（`exports` / contracts 变更）

变更触发面 → 必须在 PR 描述按下表说明：

| 改动 | 触发面 | PR 描述必含 |
|------|------|-----------|
| 在 `@gocell/<pkg>/package.json#exports` 删除 / 改签名 | 所有消费方 | Grep 消费点清单 + 迁移步骤 |
| `packages/contracts/src/` 因后端 schema 改动而 diff | 所有用该类型的页面 | 引用的 BR 编号 + 后端 PR 链接 + 影响页面清单 |
| `@gocell/core` 的全局 Layout / Composable 删 / 改 | `apps/web` + 所有业务 cell | 迁移示例 + 各 cell 适配点清单 |
| Pinia store id 改名 / state 形状变 | 持久化（localStorage / sessionStorage）+ devtools 用户 | migration 脚本或清空说明 |

## Codegen 链路

```
../gocell/contracts/http/**/*.schema.json
       ↓ tools/codegen/ （json-schema-to-typescript）
packages/contracts/src/<schema-name>.ts
       ↓ pnpm install（workspace:* 链接）
packages/<业务包>/src/api/<*>.ts
       ↓ @gocell/request axios instance
后端 HTTP
```

CI 校验链路完整：
1. `pnpm install --frozen-lockfile`
2. `pnpm codegen`
3. `git diff --exit-code packages/contracts/src/` —— 必须 clean
4. `pnpm -w typecheck` —— 必须通过（消费端类型未漂）
5. `pnpm -w lint && test --run`
6. `pnpm -F @gocell/web build`

## ESLint enforcement 清单

| 规则 | 用途 | 档 |
|---|---|---|
| `package.json#exports` | 私有路径 import 失败 | Hard |
| `eslint-plugin-import` `no-restricted-imports` | 拦截深路径 / 业务包横向 import | Hard |
| `eslint-plugin-import` `no-internal-modules` | 双保险 | Hard |
| `dependency-cruiser` | 跨包反向依赖 / 循环依赖检测（CI 跑） | Medium |
| `eslint-plugin-vue` | Vue 模板正确性 | Medium |
| `eslint-plugin-vuejs-accessibility` | a11y 基础规则 | Medium |
| 自定义 plugin `no-direct-axios` | 业务包不 `import axios` | Hard |
| 自定义 plugin `no-hardcoded-i18n` | 模板 / TS 中文字面量拦截 | Medium |
| 自定义 plugin `no-css-magic-number` | 颜色 / 间距 / 圆角字面量拦截 | Medium |

所有自定义 plugin 必须配反向自检测试（合规代码 0 命中），详见 `ai-robust.md` §载体决策原则。

## README 模板（每包必出）

```markdown
# @gocell/<pkg>

> 对应后端 cell：`cells/<...>core/`（如无对应则注明「前端壳」）

## 对外 exports
- `.` → 主入口（组件 / Composable / store 汇总）
- `./<subpath>` → ...

## 依赖的 contract
- `<contract-name>.v1` → ...

## 提供给其他包的能力
- `<api>` → ...

## 测试
`pnpm -F @gocell/<pkg> test --run`

## 维护者
（按 `package.json#maintainers` 或在此手填）
```
