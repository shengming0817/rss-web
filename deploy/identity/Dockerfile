# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM node:22-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS build
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
ARG RSS_IDENTITY_WEB_REVISION
RUN RSS_IDENTITY_WEB_REVISION="$RSS_IDENTITY_WEB_REVISION" pnpm build:identity

FROM nginx:1.30.4@sha256:d5792f71a9496b833bc08ea834a758c46e2b6a6306c10f4be926f38a656cdc1c AS runtime
ARG RSS_IDENTITY_WEB_REVISION
LABEL org.opencontainers.image.revision=$RSS_IDENTITY_WEB_REVISION
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/*
COPY --from=build /app/apps/identity/dist /usr/share/nginx/html/
USER 10001:10001
ENTRYPOINT ["nginx","-e","stderr","-g","daemon off;"]
CMD ["-c","/run/config/gateway.conf"]
