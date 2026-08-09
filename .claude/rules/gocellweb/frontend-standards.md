---
paths:
  - "apps/web/**/*.{ts,tsx,vue}"
  - "packages/**/*.{ts,tsx,vue}"
  - "tools/codegen/**/*.ts"
---

# 前端编码规范

## TypeScript

- `strict: true`；`noUncheckedIndexedAccess: true`；`exactOptionalPropertyTypes: true`
- 禁 `any`；边界场景 `unknown` + 类型守卫 / Zod schema
- 公开函数 / 公开组件必须显式注明返回 / props 类型（不依赖推导）
- 类型只 import：`import type { ... }`（避免运行时副作用 + 利于 tree-shake）
- 契约类型必须来自 `@gocell/contracts`；不在业务包里手写后端 DTO

## Vue 3 SFC

- **统一 `<script setup lang="ts">`**；不写 Options API；不写 `defineComponent({ setup() {} })`
- `defineProps<{ ... }>()` / `defineEmits<{ ... }>()`，禁 runtime declaration
- Slots 类型化：`defineSlots<{ default(props: { foo: string }): any }>()`
- 副作用清理：`watch` / `setInterval` / event listener 必在 `onScopeDispose` / `onBeforeUnmount` 清理
- `v-for` 必带 `:key`；`:key` 不用 index（除非列表静态）
- `v-if` 与 `v-for` 不同元素；需要兼用时套 `<template v-if>`
- 模板内禁复杂表达式（≥ 3 操作符）→ 提到 `computed`
- 模板字面文案统一走 `$t('<key>')`；零硬编中英文

## Composition API

- 一切可复用逻辑抽 `useXxx` Composable，文件 `composables/useXxx.ts`
- Composable 返回值用 `readonly()` 包裹不希望被消费方写的 ref
- Composable 副作用要可清理：返回 `{ stop }` 或自接 `onScopeDispose`
- 跨组件共享可变状态 → Pinia，**不**塞进 module-level `ref`

## Pinia

- 一个 cell 一个 store 模块；文件 `stores/useXxxStore.ts`
- `defineStore('cell.scope', () => { ... })`——id 用点分命名空间防冲突
- state / getters / actions 分清；setup 风格优先
- 跨 store 通信用 `useOtherStore()` 直接拿；不发自定义事件
- 测试用 `createTestingPinia({ stubActions: false })`

## HTTP（@gocell/request）

- 业务包**不**直接 `import axios`；必须经 `@gocell/request` 暴露的 instance
- 请求 / 响应类型必须来自 `@gocell/contracts`
- 401 自动跳 `/login`、refresh token 自动续约——逻辑在 `@gocell/request` 拦截器，业务包不重复实现
- 错误：`error.code` → i18n key → toast / inline message；不在 catch 里写中文字面量
- 不在组件 setup() 顶层裸 await fetch；用 `useAsyncData` 风格的 Composable 包装

## 样式

- 只用 `tokens.css` 暴露的 CSS 变量；禁 inline color、禁魔法数字（间距 / 圆角 / 阴影）
- 颜色：`var(--accent)` / `var(--ok)` / `var(--warn)` / `var(--err)` / 中性灰阶变量
- 圆角四档：4 / 6 / 10 / 14 px；禁其他值
- 字体：Geist（UI）/ Geist Mono（数字 / kbd）/ Instrument Serif（H1）
- 暗色用 `[data-theme="dark"]` 切换；不写 `prefers-color-scheme` media query 直分支
- AntD Vue 主题接线走 `ConfigProvider`，禁全局 `.ant-*` selector 覆盖
- 反模式（一律拒绝）：多 accent、彩色 chip 满天飞、emoji、渐变背景、阴影分块、圆角 > 14px

## i18n

- key 命名空间：`<cell-short>.<page>.<element>`（如 `access.identities.create-btn`）
- key 不复用跨页（即使文案相同）；翻译可不同
- 数字 / 日期 / 货币用 `Intl` API 或 vue-i18n 内置 `$n` / `$d`，禁手写格式
- 业务文案先 zh-CN，框架就位后批量翻 en-US；不延后**框架**搭建

## 可访问性 (a11y)

- 所有交互元素可键盘聚焦（`tabindex` 正确）
- 对话框 / 抽屉 / 下拉守 focus trap + Esc 关闭 + 关闭后焦点回归触发元素
- ARIA：`role` / `aria-label` / `aria-describedby` / `aria-expanded` / `aria-current` 该用就用
- 颜色对比度 ≥ WCAG AA（4.5:1 正文 / 3:1 大字 / 3:1 图标按钮）
- 表单：每个 input 必关联 label；错误用 `aria-invalid` + `aria-describedby` 关联错误文案
- 图标按钮：必须 `aria-label`
- `prefers-reduced-motion` 兜底：动画 > 200ms 必须能被 disable

## 测试

- vitest 单测：`@gocell/core` ≥ 90%，其他包 ≥ 80%
- 组件测试用 `@vue/test-utils`：聚焦行为（事件 / props / emits / slots），**不**做样式 / 快照
- Pinia 测试用 `createTestingPinia`
- Playwright 仅冒烟（login / first-run / health overview / cells list）；不追求页面级 E2E
- 测试文件并列源码：`Foo.vue` ↔ `Foo.spec.ts`；E2E 在 `tests/e2e/`

## 错误处理

- 后端 envelope `error.code` 是唯一错误真相源；前端不另起错误码
- 顶层错误边界：在 `apps/web` 的根组件 + 路由级 ErrorBoundary，捕获未处理 promise rejection 上报
- catch 必须做事（log / toast / 转换为业务结果）；禁空 catch、禁 `console.log` 留产
- 用 `Result<T, E>` 风格函数（`@gocell/shared` 提供）替代 throw 处理可预期的业务错误

## 命名

- 文件：组件 `PascalCase.vue`；Composable / Pinia store / util `camelCase.ts`
- 组件名 ≥ 2 词（避免与 HTML 元素冲突）
- 事件名 kebab-case：`@row-click`、`@close`
- Props camelCase 定义，模板 kebab-case 使用
- CSS class：BEM-lite `block__element--modifier` 或全 utility（择一，不混用）

## Git / commit

- Conventional Commits：`<type>(<scope>): <描述>`
- type：`feat` / `fix` / `refactor` / `docs` / `chore` / `test` / `perf` / `style`
- scope：包短名（`access` / `audit` / `core` / `web` / `codegen`）
- 不 `git add -A`，只 add 修改文件
- 不 `--amend` 已 push commit；不 `--no-verify`

## Lint / typecheck 命令

```bash
# 单包
pnpm -F @gocell/<pkg> typecheck
pnpm -F @gocell/<pkg> lint
pnpm -F @gocell/<pkg> test --run

# 跨包
pnpm -w typecheck
pnpm -w lint
pnpm -w test --run

# 契约校验
pnpm codegen && git diff --exit-code packages/contracts/src/

# 构建
pnpm -F @gocell/web build
```
