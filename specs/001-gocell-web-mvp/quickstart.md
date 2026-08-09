# Quickstart — gocell-web MVP 本地起步

> 目标：拉起后端 + 前端，验证骨架可跑、契约可派生、登录闭环可走。

## 前置

- Node ≥ 20、pnpm 9.x、Go（跑后端）、Docker（基础设施）。
- 后端仓库在 `../gocell`（同级目录）。

## 1. 起后端基础设施 + 服务

```bash
cd ../gocell
docker compose up -d            # postgres/redis/rabbitmq/minio（不含 gocell 本身）
# 配置 env（参考 ../gocell/.env.example）：
#   GOCELL_JWT_PRIVATE_KEY / PUBLIC_KEY（RSA 2048）
#   GOCELL_JWT_ISSUER / AUDIENCE
#   GOCELL_BOOTSTRAP_ADMIN_USERNAME / PASSWORD（持久 operator 凭据）
make build && ./bin/corebundle  # public :8080 / internal 127.0.0.1:9090
```

## 2. 安装前端 + 派生契约类型

```bash
cd ../gocell-web
pnpm install                                   # 一次成功（SC-008）
pnpm codegen                                   # json2ts: ../gocell/contracts → packages/contracts/src/
git diff --exit-code packages/contracts/src/   # 应无 diff（SC-009）
```

## 3. 配置前端环境 + 起 dev

```bash
# apps/web/.env.development:
#   VITE_API_BASE=http://localhost:8080
pnpm -F @gocell/web dev        # Vite server.proxy 转发 /api/* 避 CORS
# 访问 http://localhost:5173
```

## 4. 验证闭环

1. 全新后端：浏览器跳 `/first-run-setup` → 走 5 步创建 admin → 跳 `/`。
2. 已 setup：`/login` 登录 → TokenPair → 进 `/`。
3. 人为过期 access token → 受保护请求触发单飞 refresh → 透明重放。
4. ⌘J 切主题（无 FOUC）、⌘K 命令面板、中英文切换。

## 5. 质量门（每 PR / 每 batch 末）

```bash
pnpm -r build                                  # 全绿（SC-008）
pnpm -r test                                   # 覆盖率 ≥50%（SC-007）
pnpm lint                                      # 边界规则无违规（SC-010）
pnpm codegen && git diff --exit-code packages/contracts/src/   # 只读（SC-009）
grep -r '"vue": "[^c]' packages/*/package.json && echo "硬编版本!" || echo "catalog OK"  # SC-010
pnpm -F @gocell/web exec playwright test       # 首屏冒烟
```

## 6. 新增业务包（metadata-first）

```bash
# 1. 先建合法 package.json（name/exports/deps workspace:* + catalog:）+ tsconfig.json
# 2. 写失败测试（TDD）
# 3. 实现 src/{api,components,composables,stores,routes.ts}
# 4. 仅从 src/index.ts 导出对外 API
# 5. apps/web/router 聚合该包 routes
# worktree 隔离: git worktree add worktrees/<NNN-slug> -b <branch> origin/develop
```
