# 部署

## 前端容器（生产形态）

多阶段镜像：`node:22` 构建 monorepo → `nginx:1.27` 托管 SPA 并反代 `/api` 到后端。

```bash
# 在 deploy/web/ 下（构建上下文自动取仓库根）
docker compose up -d --build
# → http://localhost:8081
```

或手动：

```bash
docker build -f deploy/web/Dockerfile -t gocell-web:local .   # 在仓库根
docker run -d --name gocell-web -p 8081:80 \
  --add-host host.docker.internal:host-gateway gocell-web:local
```

### 后端对接

- 后端 `gocell corebundle` 作为独立 compose 项目运行，在 host 发布 `127.0.0.1:8080`。
- nginx 把 `/api/*` 反代到 `host.docker.internal:8080`（保留 `/api/v1/...` 完整路径，与契约一致）。
- 若后端地址不同，改 `deploy/web/nginx.conf` 的 `proxy_pass`。

### 验证

```bash
curl http://localhost:8081/                              # SPA → 200
curl http://localhost:8081/api/v1/access/setup/status    # 经反代 → 后端 200
```

## 本地开发（HMR，非容器）

```bash
pnpm -F @gocell/web dev   # → http://localhost:5173，vite proxy /api → 127.0.0.1:8080
```

## 说明

- 契约类型已入库（`packages/contracts/src`），镜像构建期**不需要**后端或 `pnpm codegen`。
- Batch 0 暂无登录页（PR-07），`/` 公开，部署后表现为「连后端读 setup 状态 → 渲染骨架首页」。
