> 历史中央模式的来源记录；当前实现和接入要求见 [#2368](20260917-2368-embedded-identity.md)，本文不再作为执行入口。

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

### 联合验证的退出与记录

联合入口复用仓内受控子进程执行器；backend 阶段保留一小时上限以覆盖已有 provider/编译/测试预算，
中断后给 Python fixture 两分钟清理宽限，不用旧六百秒外层预算截断合法内部步骤。SIGINT/SIGTERM
传给受控进程组，fixture 屏蔽重复信号后进入 ExitStack，删除自身容器及匿名卷并核实消失。

无论成功失败都原子写 IDENTITY_JOINT_RECORD；记录可取得的两仓 commit/lock 与 dirty 状态、
UI/runner 摘要、失败阶段/分类及 cleanup。未确认 Docker create、清理失败或强杀导致 fixture
终态缺失均不能报告 clean/pass，而是保留具名恢复目标和临时记录目录。不会自动操作其它运行的资源；
SIGKILL 不能承诺执行 finally。UI runner 环境输入失败统一为 environment，不输出原始异常或路径。

系统域已有账户/IdP 管理由后端平台角色结果提供显示提示；系统域只提供 member 账户形态，
不提供租户 administrator/emergency 变更或 JIT。该提示不授权任何请求，平台角色授撤页面仍不在范围内。
明确拒绝或未完成的开通结果提供重新登录后新建的入口，不携带旧 operation；真正 unknown 继续只恢复原查询。


### PR #1019 修复边界

会话页按 tenant/principal/session owner 同步清空列表、分页及密码草稿；旧 owner 的在途读取不能回填。
新 owner 就绪且当前操作结束后重新读取其列表和安全投影。平台页普通同页导航不能删除或替换已有
operation；明确终态的“创建新租户”动作才可清除。未决操作离开页面时携带原 UUID，平台导航保留
这个恢复定位，返回只恢复查询，不保存或重放命令。

从携带 operation 的会话页发生失效、不可用、主动退出或改密时，登录/错误导航继续传递经过
校验的 UUID；错误页同时保留 tenant 定位以支持重载。step-up 使用现有五分钟 flow 携带该 UUID，
resume 成功回平台查询，失败先提取恢复定位再清除 flow。恢复不保存或重新执行开通命令。

联合记录保留闭集 execution 原因（spawn/exit/timeout/interrupted）。backend 未提供有效失败证据时
归 environment；有效 fixture 的 phase/classification 保留，外层 timeout/interrupted 优先。
缺失或无效 fixture 仍为 cleanup unknown，不反射原始进程异常。
