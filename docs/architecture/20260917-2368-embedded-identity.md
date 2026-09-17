# 产品宿主内认证 UI

UI 挂载 `/`，租户登录入口 `/tenants/{tenant UUID}/login`。API 仅 `/api/v2`，唯一协议 callback `/api/v2/oidc/callback`；宿主 return target `resume` 必须指向同源 `/auth/resume`。API DTO 均为 camelCase。上游 issuer/clientId 是外部企业 IdP 配置，默认本地认证不需要 IdP。

网关固定路径 `/api/identity-host/v1/config.json` 提供严格静态 JSON：`{"canonicalOrigin":"https://identity.example.test","oidcEnabled":false}`。origin 必须与浏览器完全匹配，缺失、额外字段或畸形值均拒绝启动。此文件由部署输入生成，不由身份服务动态发现。本地模式不加载 providers、login-options 或 session/security。

唯一动态宿主接口为 `GET /api/identity-host/v1/tenants/{tenant}/context`，返回 `{tenantId,principalId,sessionId,navigation:{manageAccounts,manageProviders}}`。会话控制器对三个身份坐标严格匹配；登录、刷新、重认证、失效及主体变化清空旧提示。manageAccounts 与 manageProviders 独立控制各自入口；OIDC 关闭时不显示 IdP 入口。导航只控制展示，真实请求由组件事务内宿主策略授权。403 不靠隐藏按钮替代，也不重放写入。

登录、刷新、重认证、退出、全部撤销、账户管理、IdP 配置/关联和 step-up 复用既有页面与唯一会话控制器。本人改密的 `403 / reauthentication_failed` 表示当前密码错误：清除两份密码草稿、保留会话并等待显式重新提交；未知结果仍清除本地会话且不重放。密码保持表单局部，CSRF 只在控制器闭包，HttpOnly cookie 不被应用读取。OIDC 资格仅显示服务端 eligibleStepUpProviders；缺失 authTime 显示未知，不从浏览器推断 MFA。resume 使用五分钟 tenant/kind locator 后重读会话，浏览器不交换 code。

构建：`pnpm install --frozen-lockfile`，`RSS_IDENTITY_WEB_REVISION=$(/usr/bin/git rev-parse HEAD) pnpm -F @rss/identity-app build`，`pnpm check:identity-app:build`。构建输出 apps/identity/dist 与 identity-build.json；#2436 将双方 SHA、locks、UI 摘要和镜像摘要绑定到 candidate.json。

联合 HTTP T2：两仓先提交固定源码，运行 `IDENTITY_BACKEND_FIXTURE=/absolute/identity/worktree IDENTITY_JOINT_RECORD=/tmp/joint.json pnpm test:identity:joint`。复用编排与清理记录，在 Vitest/jsdom 中使用生产 Axios XMLHttpRequest transport，通过测试 TLS 网关访问真实公开组件与参考宿主策略；没有另写 cookie/CSRF 客户端。上游网络/TOTP 的完整验证仍由 Identity 的 Keycloak T2 持有。此证明不冒称 #2366 的真实浏览器、候选恢复或容量 T3。

jsdom 25 的 XHR 只为 CORS 添加 Origin，T2 的 origin.mjs 补充 Fetch 规定的同源写请求 Origin 元数据；cookie jar、CSRF、body 和重定向仍由 jsdom 与生产 transport 处理。此窄补丁不替代真实浏览器证明。

联合 runner 先验证 CA 可读、PEM 可解析且在有效期内（允许 fixture 显式信任的自签名叶证书），再启动有界 Vitest 子进程。
启动/配置/网络失败记为 environment，已执行的协议/产品断言记为 assertion，超时与中断分别记为 timeout/interrupted；空测试结果不得通过。
Vitest JSON 只在内存消费，记录仅投影固定测试 ID、闭合步骤 ID、仓库相对文件和测试声明行号，并透传至联合 receipt；不保存或回显原始 stdout/stderr、错误消息、动态测试标题或请求凭据。180 秒外层进程预算拥有测试超时与终止清理。
