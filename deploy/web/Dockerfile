# syntax=docker/dockerfile:1
# Web production image: build the pnpm workspace, then serve the SPA with nginx.

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
COPY packages/api/package.json packages/api/package.json
COPY packages/identity/package.json packages/identity/package.json

RUN pnpm install --frozen-lockfile

# 依赖层落定后，复制源码并构建
COPY . .
RUN pnpm -F @rss/web build

# ── 运行阶段 ───────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
ENV NGINX_ENVSUBST_FILTER=^RSS_WEB_
RUN mkdir -p /etc/nginx/snippets
COPY deploy/web/templates/default.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/web/proxy-common.conf /etc/nginx/snippets/rss-proxy-common.conf
COPY --chmod=755 deploy/web/docker-entrypoint.d/15-validate-edge-env.sh /docker-entrypoint.d/15-validate-edge-env.sh
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
