# RSS Web same-origin Edge

The production image serves the SPA and proxies only the reviewed RSS API route
set. The browser uses relative paths and cannot select an upstream or tenant.
The container refuses to start unless the deployment supplies a canonical,
non-nil tenant UUID and valid, distinct Primary/Admin host and port pairs.

```bash
RSS_WEB_TENANT_ID=f47ac10b-58cc-4372-a567-0e02b2c3d479 \
  docker compose -f deploy/web/docker-compose.yml up -d --build
```

Open `http://localhost:8088`. Local compose defaults point both listeners at
`host.docker.internal` ports 8080/8081; production must set deployment-specific
private listener coordinates. The Nginx health check verifies the static root;
Internal/Health listeners and raw metrics are never exposed.

The image owns a strict CSP and the browser-facing referrer, content-type, and
frame protections. The SPA shell and its parser-blocking theme initializer are
never stored, while only build-generated content-hashed JavaScript and CSS
receive a one-year immutable cache policy. The runtime stage contains the built
`index.html`, `theme-init.js`, and hashed assets rather than the stock Nginx
error page or build toolchain.

This container listens on plaintext port 80 and does not terminate TLS. A
production ingress or load balancer that actually terminates HTTPS owns the
HTTP-to-HTTPS redirect, certificate policy, and HSTS response. The HTTP Edge
does not emit `Strict-Transport-Security` or trust a browser-authored forwarded
scheme.

The exact decision, evidence, route table, and trust boundary are in
[`docs/architecture/20260809-006-same-origin-edge-tenant-bootstrap.md`](../docs/architecture/20260809-006-same-origin-edge-tenant-bootstrap.md).
