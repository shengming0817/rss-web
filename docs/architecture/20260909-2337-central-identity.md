# #2337：独立中央 Identity 应用

维护者确认：中央 Identity UI 源码位于 rss-web 的 `apps/identity`，后端与唯一协议 callback 由 rss-identity 持有。基线为 rss-web `dc2863c5ceeedcd364ed6243e2342a63130ccea5` 和 rss-identity `9e7c645f53ac2171e88738656b85976c1126f873`；实际实现版本、构建与联合 T2 结果记录在双 PR。

新应用独立构建，不加载旧 apps/web 的 bearer controller、业务 API 或 profile 验证链。复用 core 公共组件、主题和国际化；业务 API/严格解码和唯一会话控制器留在应用内部，不新增 package。专属 `@rss/api/identity` 复用单一 HTTP executor，按端点解码 Identity 错误，不尝试旧 RSS wire。管理信息为 UI 展示事实，最终授权由实际请求决定。

入口为 `/tenants/{tenant UUID}/login`，Hydra 页面为 `/login` 和 `/consent`。部署把 Federation `identity-ui/resume` 注册到固定同源 `/auth/resume`，IdP callback 保持 `/api/v1/oidc/callback`。无 tenant picker、跨源 credentials 或 runtime API origin 选择。生产静态资源、origin/TLS 与后端装配由 I08 交付。

浏览器 Cookie 为 HttpOnly，CSRF 仅在会话控制器内存中；登录/current/refresh 一次返回 session、identity 和 csrf_token。只有有效用户活动触发临近到期的串行 refresh；写入等待正在进行的旋转，绝不自动重放。状态未知或503不能继续使用旧权威，401退出。账户安全变更影响本人时清除本地身份，密码输入在提交时释放。

仅 flow 模块在 sessionStorage 保存标签页内的 challenge、flow、tenant 和建立时间，最多五分钟。它不保存认证状态或密码/token/verifier/CSRF，不构成授权。完成/失败/过期清除；accept 前先移除，响应未知从原应用重新开始。错误页只显示闭集原因，不反射上游 query。

## 验证与消费

`pnpm typecheck/lint/format:check/test:coverage/test:boundary/build` 包含独立应用；`pnpm test:e2e:identity` 为明确的模拟浏览器交互证明，不冒称真实后端。`scripts/check-identity-app-build.mjs` 验证产物无旧 bearer/业务入口和 mock/source map。

实际 HTTP/UI T2 由消费者 rss-web 持有：先以 frozen lock 安装依赖，提交两仓源码，再运行 `IDENTITY_BACKEND_FIXTURE=/absolute/backend/worktree IDENTITY_JOINT_RECORD=/tmp/identity-joint.json pnpm test:identity:joint`。该入口构建当前已提交的 UI，选择同一源码内的浏览器 runner，并调用后端测试专用 `make test-ui` fixture。记录两仓完整 commit、lock 摘要、实际 UI 产物摘要和 runner 摘要；后端不获取或构建消费者源码，也不把消费者版本检查加入生产请求链。

fixture 使用测试 HTTPS gateway、真实公开 Axum Router 与一次性 PostgreSQL，覆盖账户创建、停用、重置、恢复、IdP 创建/更新/测试/启停，以及退出后的 401 和普通成员 403。本接缝使用后端固定 Keycloak fixture 与生产 OIDC adapter；浏览器实际完成授权跳转、唯一 callback、resume 和 step-up。此证明不包含生产 binary/image/config、MDM 接入或生产恢复。

## #2368 平台与当前认证事实

平台管理员复用部署提供的系统域登录地址；入口 `/tenants/{tenant}/platform` 使用当前会话的
`platform_administrator` 提示和后端平台上下文结果。列表与创建消费现有平台 API，网页自动生成
租户、首个管理员与操作 UUID，口令只在组件和本次请求中存在。201/202 分别表示可登录/待激活，
后续读取失败不改变已确认的提交事实。未知结果只查询原 operation；404 仍为未观察到，不能重放。
校验后的 operation UUID 可随同域页面、登录、错误导航恢复查询；不保存命令、秘密或任意 return URL。

`GET /api/v1/tenants/{tenant}/session/security` 是 Federation 的唯一浏览器安全投影，返回当前 session ID、
规范认证事实和当前主体 eligible providers。会话控制器按消费者需要读取并合并并发调用，刷新、
退出和上下文变化使旧快照失效。页面不根据 provider 管理列表、AMR 是否为空或 URL 判断 MFA/资格。
step-up 使用现有 POST、唯一 callback 与 resume；五分钟 flow locator 增加 step-up 类型及可空的
operation 查询定位。旧 locator 字段形状直接作废，没有兼容读取分支。

所有排队操作绑定页面与会话上下文；跨租户路径重新挂载视图，已知会话到期统一清空身份。
平台开通只给出目标租户登录地址，不授予目标租户内容访问或 MDM 权限。

同步当前后端协议：session identity 必须含 platform_administrator；账户列表与账户写入回执分别
严格解码；provider settings 移除 secret_ref，管理创建/更新显式提交 client_secret/ca_pem，响应
包含 credential_version。秘密从不回填或持久化，旧字段集合与旧请求体不再接受。

本项不增加身份关联、平台角色管理、已有租户管理员增补或通用 MFA 策略 UI。真实 T2 还覆盖
平台网页开通、首个管理员登录和普通租户身份拒绝；MFA 产品 T3 仍由 #2366 持有。
