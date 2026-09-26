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
