# RSS Web

本仓维护独立部署的 MDM 控制台（`apps/mdm`）与 Identity 认证 UI（`apps/identity`）。`@rss/auth` 提供共享 cookie 会话与认证 UI，`@rss/core` 提供展示基础，`@rss/api` 拥有单一 HTTP 执行边界；每个应用独立装配唯一会话 owner，权限由后端决定。

接入、部署及会话行为见[宿主认证 UI](docs/architecture/20260917-2368-embedded-identity.md)。

MDM 无后端演示：`pnpm dev:mdm:demo`；生产构建：`pnpm build:mdm`；镜像：`pnpm image:mdm --tag rss-mdm-web:my-version`。接入、候选合同与部署见 [MDM 与 Identity 独立前端](docs/architecture/20260926-2544-mdm-web.md)。

## 开发与验证

使用 Node.js 22、pnpm 11.4.0：

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test:coverage
pnpm test:boundary
pnpm build
```

`pnpm dev` 持续构建 `apps/identity/dist`，不启动独立 HTTP 页面或 API。交互开发复用已配置的 HTTPS 开发宿主，把该目录只读挂载到网关；完成首次构建后，打开宿主的租户登录地址，修改后等待重建完成并手动刷新。完整接入、检查和退出步骤见[交互开发](docs/architecture/20260917-2368-embedded-identity.md#交互开发)。没有宿主时可运行上述组件测试与构建。

`pnpm build:identity` 是生产构建和产物安全扫描的唯一实现，`pnpm build` 分别调用 Identity 和 MDM 的生产构建。镜像构建使用当前工作树，允许未提交修改，不要求 Git revision：

```bash
pnpm image:identity --tag rss-identity-web:my-version
```

必要的真实 HTTP 联调使用本地 rss-identity 测试 fixture，要求 Docker 和后端工具链：

```bash
IDENTITY_BACKEND_FIXTURE=/absolute/path/to/rss-identity pnpm test:identity:joint
```

该入口构建当前 UI，通过 jsdom 的生产 XMLHttpRequest transport 访问真实 HTTPS 宿主，覆盖 cookie/CSRF、账户、Provider、step-up 和故障语义。它不是实际浏览器或生产部署验收。中断与超时仍等待 fixture 清理；清理失败返回非零并显示恢复目录，不输出凭据和原始响应。不要求提交、干净 checkout 或源码/产物摘要证明，可复用构建缓存。

历史来源记录保留在 [`docs/migration/20260809-001-gocell-web-source-baseline.md`](docs/migration/20260809-001-gocell-web-source-baseline.md)，不作为当前功能或操作入口。

正式 Policy 自助配置的实际浏览器验收使用 Chromium 和独立 HTTPS MDM 开发环境（不接入 demo）：

```bash
pnpm exec playwright install chromium
MDM_POLICY_BROWSER_FIXTURE=/absolute/path/to/private-fixture.json pnpm test:mdm:policy-browser
```

fixture 由隔离宿主准备，包含 `origin`（https://localhost:端口）、`tenant`、`instance`、`principal`、`login`、`passwordFile`，以及 `script`（迁移后 access=null/published=false、保留 false/1 的可编辑脚本 Policy）、`software`（已准入的 available_install Policy）和 `selectors`（同租户有效 IdP 群组、部门 exact/subtree、启用静态用户群组的正式 selector）。引用版本须已激活、设备 Scope 已发布；另含 `reader: {login,passwordFile}`（仅 policy_read/resource_read 的账户）；`departmentDirectory=true` 时在可信部门目录中选取，否则通过正式 API 预置固定部门引用并验证界面回读保留。生产 UI 由该宿主网关提供。入口更改这些可丢弃 Policy，覆盖脚本/软件三种访问模式及刷新、空范围、撤回保持后台配置、真实 400/401/403/409 与丢失已提交写响应后的锁定；退出关闭浏览器，不记录凭据、页面、网络响应或追踪。宿主资源由创建它的开发环境负责清理；此入口不证明 Windows/macOS 实际安装效果。

注册旅程的生产 HTTPS 浏览器入口为 `MDM_ENROLLMENT_BROWSER_FIXTURE=/absolute/private-fixture.json pnpm test:mdm:enrollment-browser`；fixture、原生／PKI前提和逐项覆盖边界见 [MDM 接入说明](docs/architecture/20260926-2544-mdm-web.md#原生注册组织接入与-agent-安装交付2633)。
