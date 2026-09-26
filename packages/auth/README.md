# @rss/auth

共享 Identity cookie 会话状态机与认证 UI。每个应用在自己的 composition root 调用一次 `createSession`，向认证 UI、路由和业务 client 注入同一实例；包不创建全局会话。CSRF 仅由该 controller 持有，退出未知结果不重放写入，OIDC resume 只重读会话。

- 浏览器应用使用 `@rss/auth` 与 `@rss/auth/styles.css`：根入口包含 AuthShell、认证路由、i18n 和 Vue SFC，要求 Vue/Vite 工具链。
- HTTP 联调或不需要页面的消费者使用 `@rss/auth/session`：仅导出 `createSession`、`createApi`、`createFlows`、`loadConfig` 及相关类型，不加载 SFC、router 或 UI。
- `runtimeKey` 的 `landingRoute` 由应用指定认证后落点；Identity 默认 `sessions`，MDM 使用 `workspace`。它仅拥有导航，不授予资源权限。

MDM binding 通过同一 owner 的 `business` 接口派发：业务请求相互并发；认证控制操作等待在途业务请求结束，新业务请求等待控制操作完成后取得当前 CSRF。排队或在途响应仍受会话与页面代际约束；业务 401 清认证，其它业务失败保留认证。调用方只在回调中执行一次 HTTP 请求，不嵌套调用会话控制操作，不自动重放，也不创建第二 controller。认证 host context 只是账户/Provider 的展示提示，MDM 资源授权继续由后端持有。
