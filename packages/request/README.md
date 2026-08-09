# @gocell/request

> Axios 单例 + 请求/响应拦截器 + 错误码 → i18n key 映射。基础设施层，无业务概念。

**对应后端 cell**：无（基础设施层）

## 对外 exports（`package.json#exports: "."` 唯一入口）

| 导出 | 类型 | 说明 |
|------|------|------|
| `http` | `AxiosInstance` | 全局共享 axios 单例，baseURL 默认 `/api` |
| `setupAxios(opts)` | `(SetupAxiosOptions) => void` | 在 `http` 上安装拦截器；幂等，可重复调用 |
| `toI18nKey(err)` | `(unknown) => string` | 将 AxiosError 转换为 i18n key 字符串 |
| `SetupAxiosOptions` | interface | DI 回调签名（见下） |
| `GoCellRequestError` | interface | 扩展 AxiosError，携带 `i18nKey?: string` |

## `SetupAxiosOptions` 签名

```ts
interface SetupAxiosOptions {
  baseURL?: string                          // 覆盖默认 /api
  getToken: () => string | null             // 读内存中的 access token
  onRefresh: () => Promise<string | null>   // 刷新 token，失败返回 null
  onAuthFail: () => void                    // 清 auth 状态（不在拦截器跳路由）
}
```

`apps/web` 在启动时调用 `setupAxios`，传入 `@gocell/access` 提供的回调（PR-06 装配）。本包不依赖 `@gocell/access`。

## 依赖的 contract

- `error-response-v1`（`packages/contracts/src/shared/errors/error-response-v1.ts`）：`GoCellHTTPErrorResponse`，用于从后端 envelope 取 `error.code` 转 i18n key。

## 拦截器行为

### 请求拦截

`getToken()` 非空 → 注入 `Authorization: Bearer <token>`。

### 响应拦截（401 单飞刷新）

- 模块级 `isRefreshing` + `refreshPromise` + 等待队列实现单飞（single-flight）。
- 首个 401（非重放、非 refresh 端点本身）→ 调 `onRefresh()`；后续并发 401 → 入队等待同一个 `refreshPromise`。
- 刷新成功 → 为所有排队请求注入新 token 并重放。
- 刷新失败（`null` 或抛错）→ 调 `onAuthFail()`，reject 所有排队请求。
- 防死循环：`config.__isRetry = true` 标记 + refresh 端点 URL 豁免。

### 非 401 错误

附 `error.i18nKey = toI18nKey(error)` 后 reject，组件层 catch 后直接用 key 渲染提示。

## 为何不依赖 `@gocell/access`

`@gocell/request` 是基础设施层，`@gocell/access` 是业务 cell。若 request 直接 import access，会形成循环依赖（access 调 http，http 调 access）。token 读取/刷新逻辑通过 `setupAxios` DI 回调注入，装配点在 `apps/web`，本包保持纯净无业务依赖。

## 测试

```bash
pnpm -F @gocell/request test --run
pnpm -F @gocell/request typecheck
```

覆盖场景：Bearer 注入（有/无 token）、单个 401 刷新重放、并发 3x401 单飞（onRefresh 仅调一次）、刷新失败 reject + onAuthFail、__isRetry 防死循环、refresh 端点豁免、非 401 i18nKey 附加、setupAxios 幂等。
