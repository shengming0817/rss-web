# @gocell/access

> 对应后端 cell：`cells/accesscore`

auth store（全内存 token）+ first-run / login 视图 + Identities 列表 + PDP client（接真实后端 `/api/v1/access/decide`）的实现包。

## 对外 exports

| 入口 | 内容 |
|---|---|
| `.` (`src/index.ts`) | `useAuthStore`、`AuthUser`（type）、`createPdpClient`、`createHttpDecide` |
| `./stores` (`src/stores/index.ts`) | `useAuthStore`、`AuthUser`（type）、`useIdentitiesStore`、`usePoliciesStore`、`Role`（type） |
| `./views/login` (`src/views/LoginView.vue`) | `LoginView`（默认导出，`apps/web` 路由懒加载） |
| `./views/first-run` (`src/views/FirstRunSetupView.vue`) | `FirstRunSetupView`（默认导出，`apps/web` 路由懒加载） |
| `./views/identities` (`src/views/IdentitiesView.vue`) | `IdentitiesView`（`/access/identities` 列表页，路由懒加载） |
| `./views/policies` (`src/views/PoliciesView.vue`) | `PoliciesView`（`/access/policies` 策略页，路由懒加载） |
| `./views/coming-soon` (`src/views/AccessComingSoonView.vue`) | `AccessComingSoonView`（通用占位页，路由懒加载） |

> 每个 view 各为独立 export 子路径 → 各自独立 async chunk（访问 `/login` 不连带加载 first-run 向导 / identities 表）。
> `api/setup`、`api/identities`、`composables/useSetupWizard`、`lib/validation`、`lib/identityValidation`、
> `components/{IdentityStatusPill,IdentityFormModal,ChangePasswordModal,ConfirmDialog}.vue`
> 是包内私有模块（不在 `exports`），仅供本包 views / store 消费。
> a11y modal 原语 `ModalShell`（focus-trap + ESC + backdrop + 背景 inert + 焦点回归）已归属
> `@gocell/core/components`，三个 modal 经 `import { ModalShell } from '@gocell/core/components'` 消费。

## 依赖的 contract

| contract | 用途 |
|---|---|
| `HttpAuthLoginV1Request/Response` | `useAuthStore.login()` 请求/响应 |
| `HttpAuthRefreshV1Response` | `useAuthStore.refresh()` 内部消费 |
| `HttpAuthSetupStatusV1Response` | `api/setup.fetchSetupStatus()` first-run 门控 |
| `HttpAuthSetupAdminV1Request/Response` | `api/setup.createAdmin()` 首位 admin 创建 |
| `HttpAuthUserGetV1Response`（`['data']`） | `api/identities` 的 `Identity` 行类型（list 行字段复用 get 契约） |
| `HttpAuthUserCreateV1Request` | `api/identities.createUser()`（POST `/users`） |
| `HttpAuthUserPatchV1Request` | `api/identities.patchUser()` 编辑（PATCH `/users/{id}`，email/status/requirePasswordReset；PATCH 是 email-only PUT `update` 的超集，故 UI 不另用 update） |
| `HttpAuthUserChangePasswordV1Request` | `api/identities.changeUserPassword()`（POST `/users/{id}/password`，old+new） |

> **BR-005 pending**：`http.auth.user.list` 后端尚未交付（`/users` 路由仅 8 handler，无 list）。
> `api/identities.ts` 的 `UserListPage` 信封（`{ data, nextCursor, hasMore }`，cursor 分页，对齐
> `HttpAuditListV1Response` / `HttpAuthRoleListV1Response` 约定）是**临时本地类型**；后端交付 schema、
> `pnpm codegen` 派生 `HttpAuthUserListV1Response` 后即删除并切换。详见
> `docs/backend-requirements/BR-005-user-list.md`。

contract 来源：`@gocell/contracts`（codegen 派生，只读）。

## 提供给其他包的能力

### `useAuthStore` (Pinia store `access.auth`)

- **state**：`user`、`accessToken`、`passwordResetRequired`（内部：`refreshToken`、`sessionId`，不对外暴露）
- **getter**：`isAuthenticated: boolean`
- **actions**：
  - `setSession(payload)` / `clearSession()`
  - `login({ username, password })`：POST `/sessions/login`（带 `__skipAuthRefresh` + `withCredentials`，401 不触发 refresh），成功 `setSession`，失败抛出（错误带 `i18nKey`）；导航由调用方负责
  - `logout()`：best-effort `DELETE /sessions/{id}`（带 `withCredentials`，收后端清 cookie）+ `clearSession()`
  - `refresh(): Promise<string | null>`：`@gocell/request` 的 `onRefresh` 回调，同时是 `bootstrapSession()` 冷启动续期的引擎。cookie 优先（靠 httpOnly `__Host-gocell_rt`，BR-005），无内存 token 也发 `POST /sessions/refresh`（空 body）续期；内存 token 作 body 兜底
- 安全铁律：access token / 内存 refresh token **仅内存**，绝不写 localStorage / sessionStorage。冷启动续期靠浏览器托管的 **httpOnly cookie**（JS 不可读），铁律不破。

### `LoginView` / `FirstRunSetupView` (`./views/login` · `./views/first-run`)

- 全屏独立布局（不在 `AppShell` 内）；`apps/web` 路由各自懒加载独立子路径（`() => import('@gocell/access/views/login')` / `'@gocell/access/views/first-run'`）—— 无 `./views` 聚合入口。
- `LoginView`：用户名+密码登录；oracle-safe 错误文案（统一 `ERR_AUTH_LOGIN_FAILED`，不暗示账号存在，PRD R3）。
- `FirstRunSetupView`：5 步引导向导（Preflight `setup/status` → Two planes → Operator(Basic Auth) → Admin(body) → Submit/Done `setup/admin`）；410 静默跳 `/login`（R9）。

### `useIdentitiesStore` (Pinia store `access.identities`) + `IdentitiesView` (`./views/identities`)

- **store state**：`users`、`loading`、`errorKey`、`nextCursor`、`hasMore`、`filter`（client-side quick-filter）
- **store getter**：`filteredUsers`（按 username / email 子串过滤当前已加载页）
- **store read actions**：`fetchList()`（首页，replace）、`loadMore()`（cursor 续页，append；无下页或在途时 no-op）；错误经 `toI18nKey` 落 `errorKey`，不抛中文字面量
- **store mutation actions**：`create` / `edit` / `lock` / `unlock` / `remove` / `changePassword`。**与读操作相反，mutation 失败时 re-throw**（由触发的 modal 内联展示并保持打开）；成功后 `await fetchList()` 以列表为真相源（`changePassword` 不 refetch，行可见字段不变）。
- **`IdentitiesView`**：`AppShell` 内子路由 `/access/identities`；hand-rolled 语义 `<table>` + status pill + 客户端筛选 + 禁用「服务账号」tab 占位（FR-030，`aria-disabled` + `tabindex="-1"`）。行操作（create/edit/change-password/lock/unlock/delete）开 modal，每个动作按钮挂 `<Can>`（fail-closed：PDP 不允许即隐藏）；路由另挂 `meta.requiredAction='read'` + `requiredResource='identity'`（guards.ts 经 `decide()` 查后端真实权限 `user:read`，fail-closed，见 BR-004）。
- **BR-005**：list 端点未交付，`api/identities` 用临时信封类型（见上「依赖的 contract」）。

### `createPdpClient(options?): PdpClient`

- 实现 `@gocell/core` 的 `PdpClient` interface（`PDP_INJECTION_KEY`）；持有缓存 + TTL（5min）+ 单飞 + fail-closed，与决策源解耦。
- 决策源经 `options.decide` 注入。装配层（`apps/web/main.ts`）注入生产源 `createHttpDecide()`；未注入时 fail-closed deny-all 兜底（不 fail-open）。

  ```ts
  app.provide(PDP_INJECTION_KEY, createPdpClient({ decide: createHttpDecide() }))
  ```

### `createHttpDecide(): DecideFn`

- 生产决策源——接后端 `POST /api/v1/access/decide`（contract `http.auth.decide.v1`，BR-004 §4.1，gocell#1863 已上线）。
- 把 UI (action, resource) 经 `pdp/permissionMap` 的 `toPermission` 翻译成后端注册的权限名（`<domain>:<verb>`，如 `identity` read → `user:read`、`cell` read → `system:read`），coarse 检查不传后端实例 `resource`；响应 `{ data: { allowed } }` 映射回 `Decision`。HTTP 失败（400 未注册 action / 403 / 503）→ 抛出 → client 链路 fail-closed deny。
- 真相源：后端 `framework/pkg/authz/permission.go` 的 `allPermissions`。新增 `<Can>` 动作 / 路由 meta 资源时，无对应注册权限即 fail-closed 隐藏。

## 边界

- 依赖：`@gocell/core`、`@gocell/contracts`、`@gocell/request`、`vue-router`、`vue-i18n`
- 严禁依赖其他业务 cell（`audit`、`config`、`observability`、`devboard`）
- HTTP 调用只走 `@gocell/request` 的 `http` 实例，禁直接 `import axios`

## 测试

```bash
pnpm -F @gocell/access test
pnpm -F @gocell/access typecheck
```

覆盖：`useAuthStore`（含 login/logout）、`createPdpClient`（fail-closed + cache + TTL）、`api/setup`、`api/identities`（list + mutations）、`useIdentitiesStore`（读 + 写 + refetch）、`lib/validation`、`lib/identityValidation`、`IdentityStatusPill`、`ModalShell`（focus-trap）、`IdentityFormModal`、`ChangePasswordModal`、`ConfirmDialog`、`IdentitiesView`（含 `<Can>` fail-closed）、`useSetupWizard`、`LoginView`、`FirstRunSetupView`。整包 ≥ 80%（实测 ~97.5% lines）。
