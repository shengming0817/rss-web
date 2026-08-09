# syntax=docker/dockerfile:1
# gocell-web 生产镜像：多阶段（node 构建 monorepo → nginx 托管 SPA + 反代 /api）。
# 构建上下文 = 仓库根（pnpm workspace 需全量 packages/apps/tools + lockfile）。

# ── 构建阶段 ───────────────────────────────────────────────────────────────
FROM node:22-slim AS build
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# 优先复制 lockfile + workspace 配置 + 各包 package.json，再执行 install。
# 这样 pnpm install 层只在依赖变化时才失效，源码改动不触发重装（cache 优化）。
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./
# 复制各子包的 package.json（保持相对路径，pnpm workspace 解析需要）
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/request/package.json packages/request/package.json
COPY packages/access/package.json packages/access/package.json
COPY packages/audit/package.json packages/audit/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/observability/package.json packages/observability/package.json
COPY packages/devboard/package.json packages/devboard/package.json
COPY tools/codegen/package.json tools/codegen/package.json

# 契约已生成并入库（packages/contracts/src），构建期无需后端、无需 codegen。
RUN pnpm install --frozen-lockfile

# 依赖层落定后，复制源码并构建
COPY . .
RUN pnpm -F @gocell/web build

# ── 运行阶段 ───────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
COPY deploy/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1
