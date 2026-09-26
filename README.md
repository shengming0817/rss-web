# RSS Web

本仓维护产品宿主内的 Identity 认证 UI（`apps/identity`），仅消费同源 HTTP v2。共享代码位于 `@rss/core`（主题、国际化、弹窗、样式）与 `@rss/api/identity`（HTTP transport）；管理授权由后端组件与宿主策略决定。

接入、部署及会话行为见[宿主认证 UI](docs/architecture/20260917-2368-embedded-identity.md)。

## 开发与验证

使用 Node.js 22、pnpm 11.4.0：

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test:coverage
pnpm test:boundary
pnpm build
```

`pnpm build:identity` 是生产构建和产物安全扫描的唯一实现，`pnpm build` 调用它。镜像构建使用当前工作树，允许未提交修改，不要求 Git revision：

```bash
pnpm image:identity --tag rss-identity-web:my-version
```

必要的真实 HTTP 联调使用本地 rss-identity 测试 fixture，要求 Docker 和后端工具链：

```bash
IDENTITY_BACKEND_FIXTURE=/absolute/path/to/rss-identity pnpm test:identity:joint
```

该入口构建当前 UI，通过 jsdom 的生产 XMLHttpRequest transport 访问真实 HTTPS 宿主，覆盖 cookie/CSRF、账户、Provider、step-up 和故障语义。它不是实际浏览器或生产部署验收。中断与超时仍等待 fixture 清理；清理失败返回非零并显示恢复目录，不输出凭据和原始响应。不要求提交、干净 checkout 或源码/产物摘要证明，可复用构建缓存。

历史来源记录保留在 [`docs/migration/20260809-001-gocell-web-source-baseline.md`](docs/migration/20260809-001-gocell-web-source-baseline.md)，不作为当前功能或操作入口。
