# Phase 0 Research — gocell-web MVP

> 来源：ship 三 agent 探索（架构对标 / 测试策略 / 边界与安全）。每条给出**采纳决策**与理由。

## 1. Monorepo 架构（对标 Vben Admin 31.8k⭐ / pnpm 官方 / Nuxt monorepo）

**决策**：采用 **pnpm workspace（非 Nx）+ catalog 钉版 + package.json#exports 收口 + 单 tsconfig.base.json paths**。

- 物理隔离：pnpm workspace + git worktree（每 feature 一 worktree，对齐后端约定）。
- 逻辑隔离：每包 `exports: { ".": { types: "./src/index.ts" } }` → 深路径 import 在 bundler + TS 层即失败。
- 版本统一：`pnpm-workspace.yaml#catalog:` 单点钉死所有第三方版本，业务包以 `"catalog:"` 引用。
- 路径：`@gocell/*` alias（`tsconfig.base.json#paths`），跨包禁相对路径。
- 依赖声明：`dependencies` 用 `workspace:*`（等价后端 `slice.contractUsages`）。

**关键取舍**：
- 为何 pnpm 非 Nx：< 20 包时 Nx 过重；pnpm 原生 `workspace:*` + `catalog:` 足够。
- 为何 paths 非 project references：避免 Vite 虚拟模块解析问题，开发更简单（Vben 同款）。

**陷阱**：幻影依赖（用 `.npmrc hoist-pattern`）、并行 worktree 的 lockfile 漂移（CI `--frozen-lockfile`）、忘记切 `"catalog:"`（Batch 0 加 grep 校验）。

**catalog 初始版本（探索建议，落地时取最新稳定）**：vue 3.4 / vite 5 / typescript 5.3 / pinia 2.1 / vue-router 4.2 / axios 1.6 / ant-design-vue 4.2 / vue-i18n 9.10 / vitest 1.x / @vue/test-utils 2.4 / playwright 1.40 / eslint 8.x / prettier 3.x / json-schema-to-typescript 13.x。

## 2. 契约类型 codegen（D1，对标 json-schema-to-typescript）

**决策**：`tools/codegen/`（**置于 pnpm workspace 之外**的 Node 脚本）glob `../gocell/contracts/http/**/*.schema.json` → json2ts → `packages/contracts/src/`；`pnpm codegen` 触发；CI `git diff --exit-code packages/contracts/src/` 校验只读。

- 派生命名按 `http.{ns}.{action}.{side}` 去重，避免 schema `title` 冲突。
- 生成 banner `/* AUTO-GENERATED — DO NOT EDIT */` + 包内 README 警告。
- pre-commit hook：`git diff --cached packages/contracts/src/` 非空即拒绝。
- 处理 `$ref` 循环引用：json2ts 原生支持，但需用真实 `../gocell/contracts/` 验证一遍。

## 3. 包边界 ESLint（双锁）

**决策**：Layer1 结构锁 = `exports` 字段；Layer2 语义锁 = ESLint `import/no-restricted-paths`（zones：业务包只能 import core/shared/contracts/request；access↔audit 等互禁）+ `import/no-internal-modules`（forbid `**/src/**`，allow `*/src/index`）。

- resolver 配 `import/resolver: { typescript, vite }` 避免虚拟模块误报。
- 策略：同包内允许相对 import，跨包禁止。
- Batch 0 末期落地（blocking）。

## 4. AntD Vue 4 主题注入（oklch tokens → ConfigProvider）

**决策**：三层桥。tokens.css（oklch + `[data-theme=dark]`）→ `useThemeTokens()` 读 CSS 变量并把 seed 色转 sRGB → `ConfigProvider :theme="{ algorithm, token, cssVar: true }"`。

- `cssVar: true`（AntD 5.x/4.x 新特性）让主题切换走 CSS 变量、避免 cssinjs 重序列化 → 无 FOUC。
- oklch→hex 有损（oklch 色域更大）：seed 色预转并存映射表，或用 oklab 库。
- 主体颜色用 CSS 变量直接驱动；AntD 仅注入 seed token，组件级 token 由 algorithm 派生。
- darkAlgorithm 可能与 V1 Linear 不完全吻合：需对照设计稿微调，必要时自定义 algorithm。

## 5. Axios 拦截器（Bearer + 401 单飞刷新 + 错误→i18n）

**决策**：`@gocell/request` 内分层拦截器。请求拦截注入 `Authorization: Bearer`；响应拦截 401 → **单飞刷新队列**（`isRefreshing` 标志 + `refreshQueue`，仅首个 401 触发 refresh，其余排队等新 token 后重放）；失败 `logout()` + 跳 `/login`；非 401 错误映射 `error.code → errors.{code}` i18n key。

- 对标 `axios-auth-refresh`：单飞队列是成熟范式。
- **循环依赖**：`@gocell/request` 不能静态 import `@gocell/access` 的 auth store；在拦截器内**惰性获取** store（运行时），或把 token 读取做成可注入回调（`setupAxios({ getToken, onRefresh, onAuthFail })`），由 `apps/web` 启动时装配 —— 更干净，避免 request→access 反向依赖违背宪法第 I 条。
- 重放避免死循环：`config.__isRetry` 标记。
- i18n 未初始化时拦截器已触发：错误映射延迟到组件消费 `error.i18nKey`，而非拦截器内 `t()`。

> ⚠️ 探索给的示例里 `@gocell/request` 直接 `import { useAuthStore } from '@gocell/access'`，**违反宪法第 I 条（基础设施包不依赖业务包）**。落地时改为依赖注入（`setupAxios` 回调），由 `apps/web` 装配。已在 plan.md 标注为强制项。

## 6. 测试策略（对标 Vitest 3.x workspace / MSW / Pinia testing / Playwright）

**6.1 per-package Vitest**：根 `vitest.workspace.ts`（或 Vitest 3.2+ 的 `projects`）聚合每包 `vitest.config.ts`（jsdom + @vue/test-utils + `globals:true`）；v8 coverage `lines/functions/statements ≥50%`、`branches ≥40%`；exclude `packages/contracts/src/**`（生成）+ `index.ts` + `*.d.ts`。catalog 钉死 vitest/@vue/test-utils/jsdom/coverage-v8 版本。

**6.2 table-driven（`it.each`）**：用于 error-code→i18n 映射、拦截器分支矩阵（200/401-refresh-ok/401-refresh-fail/403/500）、守卫决策矩阵。对齐后端 Go table-driven 风格，case name 须唯一便于定位。

**6.3 难点单测**：
- 401 单飞拦截器：mock `axios.request`（非整个 client，保留拦截器链）；测"单 401 仅一次 refresh""并发 401 仅一次 refresh 且都重放""refresh 失败触发 onTokenExpired"（`Promise.all` + 计数）。
- auth store：`beforeEach(setActivePinia(createPinia()); localStorage.clear())`；测 token 生命周期 / logout / 重建实例（模拟刷新）持久化。
- 路由守卫：`createMemoryHistory` + 真实 Pinia，仅 mock setup-status / PDP 调用；测三段顺序与重定向。
- theme/i18n：测 `data-theme` DOM 变更 + localStorage + matchMedia OS 偏好；**FOUC 无法在 jsdom 测**，靠 Playwright 视觉验证（机制单测 + E2E 视觉双管）。

**6.4 HTTP mock**：MSW（`setupServer`，`beforeAll/afterEach/afterAll`）用于组件集成 + 共享 fixture；axios-mock-adapter 用于拦截器底层单测。fixture 用 `@gocell/contracts` 派生类型写**工厂**（`createAuditLog()` 等）置于 `shared/__factories__`，不手写形状（复用 D1 类型，全量 schema→fixture codegen 过重，ADAPT 为手写工厂）。

**6.5 Playwright 首屏冒烟**：`webServer` 拉 `pnpm -F @gocell/web dev`；3 个冒烟：未登录→`/login` 重定向、shell 渲染（sidebar/topbar `data-testid`）、主题切换（`data-theme` 变更 + 截图）。`addInitScript` 注入登录态。

**6.6 金字塔 + per-batch TDD 清单**：Unit 70% / Integration 20-25% / E2E 5%。Batch 0 搭测试基建（workspace config + setup + 工厂 + test-utils `createTestPinia/createTestRouter`）；目标 Batch 1 末 ≥50%，MVP 完成 60-70%。各 batch TDD 清单见 tasks.md 的 "Tests for ..." 段。

> ⚠️ 测试探索示例用 `useStorage('gocell:tokens')` 把 **access token 存 localStorage**，与安全探索（§7.1，access token 必须内存）**冲突**。以安全结论为准：access token 内存、不落 localStorage；测试示例仅作 API 用法参考。speckit-analyze 已记此一致性项。

## 7. 边界条件与安全（对标 OWASP / axios-auth-refresh / SPA JWT 实践）

**7.1 JWT 存储**：access token → **内存（Pinia store）**，刷新即丢（强制 silent refresh，免 localStorage XSS 窃取）；refresh token → 理想是 **httpOnly + Secure + SameSite=Strict cookie**。
- ⚠️ **待后端确认**：当前契约 `sessions/login` 在 **body** 返回 refreshToken。若后端不下发 httpOnly cookie，则 MVP 退而求其次：refresh token 存内存 + 页面挂载时静默 refresh（牺牲跨刷新无感，换不落盘）。**登记为对后端的确认项 / 风险 R1**，不在前端 localStorage 持久化 refresh token。
- App 挂载时若有历史 session 标记则静默 `POST /sessions/refresh` 续期；失败清状态跳 `/login`（R7）。
- Bearer-in-header 设计**天然免 CSRF**；切勿改为 cookie 承载 access token。

**7.2 401 单飞刷新（R2）**：响应拦截器内 `refreshPromise` 单飞 + 队列，`config.__retry` 防死循环；刷新失败 `logout()`（重定向交由 router，避免拦截器硬跳）。代码蓝本见 plan.md。

**7.3 First-run / oracle-safe（R3/R9）**：
- 登录失败文案**禁止**暗示账号存在（"用户名或密码错误"统一文案，无"该账号不存在/密码错"）。first-run **无**"忘记密码"链接（一次性窗口，需"请记下密码"提示 + 确认）。
- `GET /setup/status` 仅用于**路由门控**，不渲染"系统是否已 setup"诊断文案；已 setup 静默跳 `/login`。
- setup 用 Basic Auth（operator 凭据，**不持久化**）+ body（新 admin 凭据）两层；表单收两组用户名/密码。
- 错误码分支：400 校验→i18n、401 operator 凭据错、409/410 已完成→静默跳 `/login`。

**7.4 PDP `<Can>`（R4/R6/R11）**：客户端授权**仅 UX**，后端每个 mutation 再校验。
- `<Can>` UI 壳在 `@gocell/core`，`useDecision()` PDP client 在 `@gocell/access`。
- **fail-closed**：pending 或 PDP error 一律隐藏/禁用，绝不 fail-open。
- 决策缓存 5min TTL（MVP 无实时失效）；403 时提示"权限已变更"，不泄漏策略细节。
- **路由 meta 禁硬编 role**；用 `meta.requiredAction` + PDP 评估（ABAC-ready）。批量决策留 Wave 2。

**7.5 SPA 加固**：禁止对动态/用户内容用 `v-html`（用 `{{ }}` 自动转义，富文本走 DOMPurify，Wave 2+）（R10）；生产部署 CSP `default-src 'self'`、无 inline script（Vite 友好），`connect-src` 放行 LGTM 后端、`frame-ancestors 'none'`；错误 envelope `error.code → i18n`，**不渲染后端原始 message**，`requestId` 仅 console 记录供排障。

**7.6 路由守卫顺序**：① first-run 门（公开）→ ② 认证门（未登录跳 `/login`）→ ③ PDP 授权门（最贵，最后跑）。顺序不可颠倒。

**7.7 包边界即安全**（R5/R12/R13/R15）：`exports` 收口 + ESLint `no-restricted-imports`；contracts CI `git diff` 只读；auth store 单实例（避免 logout 不同步）；core 纯 UI / access 纯逻辑，避免循环依赖。

### 风险登记（Top）

| # | 风险 | 概率 | 影响 | 缓解 | 归属 batch |
|---|---|---|---|---|---|
| R1 | refresh token 落盘/localStorage 被 XSS 窃 | 中 | 严重 | 内存 access + httpOnly refresh（待后端确认） | Batch 0 |
| R2 | 多 401 刷新风暴/竞态 | 中 | 高 | 单飞刷新队列 | Batch 0 |
| R3 | 登录文案泄漏账号存在 | 中 | 高 | oracle-safe 统一文案 | Batch 1 |
| R4 | PDP 不可达时 fail-open | 中 | 严重 | fail-closed | Batch 1/3 |
| R5 | 跨包深路径 import 破坏封装 | 低 | 中 | ESLint + exports | Batch 0 末 |
| R6/R11 | 路由 meta 硬编 role / 守卫绕过 | 中 | 高 | PDP-only 授权 | Batch 1 |
| R10 | `v-html` 注入 XSS | 中 | 高 | 禁 v-html + review 清单 | 全 batch |
| R12 | 手改 contracts schema 失同步 | 低 | 中 | CI codegen diff | Batch 0 |
| R15 | core↔access 循环依赖 | 低 | 高 | core 纯 UI / access 纯逻辑 | Batch 0 |
| R14 | LGTM 宕机拖垮 `/observe` | 低 | 低 | error boundary 优雅降级 | Batch 7 |

> ⚠️ 安全探索的多份代码示例同样在 `@gocell/request` 内 `import { useAuthStore } from '@gocell/access'`，**违反宪法第 I 条**。统一改为 `setupAxios({ getToken, onRefresh, onAuthFail })` 依赖注入，由 `apps/web` 装配。
