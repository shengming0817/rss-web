# 产品宿主内认证 UI

Identity 应用独立装配 `@rss/auth` 的唯一会话实例；MDM 复用该共享包但独立部署，见 [MDM 前端](20260926-2544-mdm-web.md)。UI 挂载 `/`，租户登录入口 `/tenants/{tenant UUID}/login`。API 仅 `/api/v1/identity`，唯一协议 callback `/api/v1/identity/oidc/callback`；宿主 return target `resume` 必须指向同源 `/auth/resume`。API DTO 均为 camelCase。Provider claims 只接受 email/groups/departmentSnapshot；departmentSnapshot 为 null 或完整 claim/maxAgeSeconds（1–300 秒），拒绝旧 department 字段。编辑其它设置保留后端配置的部门快照映射，新 provider 明确提交 null；部门配置通过后端管理 API 维护，本 UI 不新增部门目录或授权页面。此契约对应 Identity #2451。

上游 issuer/clientId 是外部企业 IdP 配置，默认本地认证不需要 IdP。

网关固定路径 `/api/v1/identity-host/config.json` 提供严格静态 JSON：`{"canonicalOrigin":"https://identity.example.test","oidcEnabled":false}`。origin 必须与浏览器完全匹配，缺失、额外字段或畸形值均拒绝启动。此文件由部署输入生成，不由身份服务动态发现。本地模式不加载 providers、login-options 或 session/security。

唯一动态宿主接口为 `GET /api/v1/identity-host/tenants/{tenant}/context`，返回 `{tenantId,principalId,sessionId,navigation:{manageAccounts,manageProviders}}`。会话控制器对三个身份坐标严格匹配；登录、刷新、重认证、失效及主体变化清空旧提示。manageAccounts 与 manageProviders 独立控制各自入口；OIDC 关闭时不显示 IdP 入口。导航 context 的网络、超时及合法 503 暂不可用只清空提示，不清除已接受的会话或 CSRF，认证操作正常完成。界面隐藏依赖提示的管理入口、显示简短提示并允许手动重读；不后台调度或自动重试。已打开的管理页区分导航未知与明确无入口；导航恢复后若列表尚未读取，显示尚未加载及手动加载按钮，不把初始空数组呈现为读取结果。401 清除会话，协议错误和身份不匹配保持失败规则；generation 拒绝旧会话的迟到响应。导航只控制展示，真实请求由组件事务内宿主策略授权。403 不靠隐藏按钮替代，也不重放写入。

登录、刷新、重认证、退出、全部撤销、账户管理、IdP 配置/关联和 step-up 复用既有页面与唯一会话控制器。本人改密的 `403 / reauthentication_failed` 表示当前密码错误：清除两份密码草稿、保留会话并等待显式重新提交；未知结果仍清除本地会话且不重放。密码保持表单局部，CSRF 只在控制器闭包，HttpOnly cookie 不被应用读取。OIDC 资格仅显示服务端 eligibleStepUpProviders；缺失 authTime 显示未知，不从浏览器推断 MFA。resume 使用五分钟 tenant/kind locator 后重读会话，浏览器不交换 code。

构建：`pnpm install --frozen-lockfile` 后运行 `pnpm build`，输出 apps/identity/dist。前端独立 Node/Nginx 多阶段镜像通过 `pnpm image:identity --tag rss-identity-web:my-version` 构建当前工作树，不要求 Git revision 或先提交。镜像使用当前 Docker/BuildKit 平台与固定基础镜像摘要，运行身份为 UID/GID 10001:10001；构建复用 `pnpm build:identity` 的类型检查、生产编译及产物安全扫描，无需后端 checkout。

部署时挂载 `/run/config/gateway.conf`、`/run/config/ui.json`、TLS 证书及私钥；配置与域名不进入静态镜像。#2436 的 renderer 用 `--identity-image` 和 `--web-image` 在目标 daemon 解析 immutable image ID 并写入 Compose，禁止隐式拉取。前后端镜像独立，前端升级不要求重建后端或替换备份；不再生产或消费 candidate.json、OCI tar 或裸二进制候选包。

联合 HTTP T2：运行 `IDENTITY_BACKEND_FIXTURE=/absolute/identity/worktree pnpm test:identity:joint`，构建当前 UI 并调用后端一次性 fixture。复用构建缓存和资源清理流程，在 Vitest/jsdom 中使用生产 Axios XMLHttpRequest transport，通过测试 TLS 网关访问真实公开组件与参考宿主策略；没有另写 cookie/CSRF 客户端。上游网络/TOTP 的完整验证仍由 Identity 的 Keycloak T2 持有。此证明不冒称 #2366 的真实浏览器、候选恢复或容量 T3。

jsdom 25 的 XHR 只为 CORS 添加 Origin，T2 的 origin.mjs 补充 Fetch 规定的同源写请求 Origin 元数据；cookie jar、CSRF、body 和重定向仍由 jsdom 与生产 transport 处理。此窄补丁不替代真实浏览器证明。

联合 runner 先验证 CA 可读、PEM 可解析且在有效期内（允许 fixture 显式信任的自签名叶证书），再启动有界 Vitest 子进程。
启动/配置/网络失败记为 environment，已执行的协议/产品断言记为 assertion，超时与中断分别记为 timeout/interrupted；空测试结果不得通过。
Vitest JSON 只在内存消费，记录仅投影固定测试 ID、闭合步骤 ID、仓库相对文件和测试声明行号，并交给后端 fixture 处理失败状态；不保存或回显原始 stdout/stderr、错误消息、动态测试标题或请求凭据。180 秒外层进程预算拥有测试超时与终止清理。

#2364 产品浏览器验收补充：退出仅在服务器确认成功后自动导航登录页。503、网关故障或未知结果保留会话页的专用退出提示；本地权威仍立即清除，退出按钮在无当前主体时禁用，不将重复点击视为撤销成功。无本地会话时，“重新读取”通过同一控制器查询当前会话，恢复认证后再加载列表；401 或 503 保留退出未知提示及显式登录入口。切回标签页的会话重读同样不会清掉未知提示。当前会话无效不证明全部会话撤销成功，不自动重放退出写入；用户可选择进入登录页，或重读取得有效会话后再明确退出。

联调不生成跨仓证明回执，不比较 commit、lock、runner 或静态文件摘要。成功清理临时目录；清理失败或状态未知时返回非零并保留恢复目录。

## 交互开发

`pnpm dev` 使用 Vite 的 build watch，持续输出与生产配置一致的静态文件；它不提供独立的 localhost 页面，不启用 HMR，也不提供模拟认证/API。首次输出与后续重建完成后手动刷新页面。类型检查另运行 `pnpm typecheck`。

前置条件：按 rss-identity 的 `docs/deployment/operations.md` 准备并启动一个**专用于开发**的参考宿主，完成安装、初始化和 open。浏览器须信任其 TLS 证书，DNS/hosts 指向该宿主，部署配置的 canonicalOrigin 与实际访问的 HTTPS origin 完全一致。已知租户 UUID 来自该实例配置。API、静态 config.json、会话 cookie 与 CSRF 均由这个真实宿主持有。

在与开发宿主 Docker daemon 相同的机器上，进入 rss-web 根目录。终端一运行：

```sh
pnpm install --frozen-lockfile
pnpm dev
```

等待首次 `built` 输出，再在终端二将当前输出挂载到既有网关。下面两个值必须对应上一步已经运行的开发部署目录和 Compose project；不要指向生产实例：

```sh
export RSS_WEB_DIST="$(pwd)/apps/identity/dist"
export RSS_IDENTITY_DEV_DIR=/absolute/path/to/development/rendered
export RSS_IDENTITY_DEV_PROJECT=identity-dev
cat > /tmp/rss-identity-web-dev.yaml <<'YAML'
services:
  gateway:
    volumes:
      - type: bind
        source: ${RSS_WEB_DIST:?run from rss-web root after the first build}
        target: /usr/share/nginx/html
        read_only: true
        bind:
          create_host_path: false
YAML
docker compose --project-name "$RSS_IDENTITY_DEV_PROJECT" \
  --project-directory "$RSS_IDENTITY_DEV_DIR" \
  -f "$RSS_IDENTITY_DEV_DIR/compose.json" -f /tmp/rss-identity-web-dev.yaml \
  up -d --no-deps gateway
```

此覆盖只替换静态文件目录；保留原网关 TLS、CSP、严格 config.json、API 路由和后端宿主策略。开发实例由当前开发者独占，使用此覆盖期间不要并行执行 operate.py 或其它部署维护。

先访问 `https://你的开发域名/api/v1/identity-host/config.json`，应返回 JSON，且 canonicalOrigin 等于当前 HTTPS origin；再访问同一域名的 `/tenants/已配置租户UUID/login`，应显示登录表单。登录、退出等请求继续走该域名的 `/api/v1/identity`。配置不可用时修正宿主/TLS/挂载，不放宽前端校验。不要打开单独 Vite HTTP 地址。

退出开发时停止终端一的 watch，再移除静态覆盖、恢复镜像自带文件：

```sh
docker compose --project-name "$RSS_IDENTITY_DEV_PROJECT" \
  --project-directory "$RSS_IDENTITY_DEV_DIR" \
  -f "$RSS_IDENTITY_DEV_DIR/compose.json" up -d --no-deps --force-recreate gateway
rm /tmp/rss-identity-web-dev.yaml
```

用于启动开发宿主的部署目录、证书与配置留在仓外；本仓不保存秘密或另建开发宿主实现。
