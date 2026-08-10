# RSS Web

RSS Web is the browser client for RSS. It is being migrated through small,
independent pull requests from a verified historical source snapshot.

The current repository is intentionally a product-neutral frontend foundation:
application shell, theme, i18n, accessibility, tests, and a narrow HTTP transport
in `@rss/api`. All historical business routes, backend calls, generated contracts,
administration screens, observability screens, Devboard, and old generation
tools have been physically removed. RSS capabilities return only through later
issues backed by selected RSS contracts.

The reviewed RSS contract selection is pinned in
[`docs/contracts/20260809-current-rss-baseline.md`](docs/contracts/20260809-current-rss-baseline.md).
It is audit evidence, not a runtime registry or a copy of backend contracts.

`@rss/identity` provides strict DTO decoding, an injected API adapter, and a
framework-neutral memory-only session controller. Only a successful
authenticated profile verification creates subject/tenant/kind authority.
Concurrent protected-request 401s share one refresh rotation and retry once;
terminal failures atomically clear the in-memory session. Tokens are never
persisted or exposed through public state. UI and router integration remain a
later issue.

The production Nginx image is a minimal same-origin Edge with a closed
Primary/Admin route table. It removes browser tenant headers and injects the
deployment-fixed tenant only for login and refresh. See the
[`same-origin Edge ADR`](docs/architecture/20260809-006-same-origin-edge-tenant-bootstrap.md).

The repository uses the single `@rss/*` workspace namespace and RSS Web product
identity. Legacy aliases, storage-key fallbacks, and dual-backend modes are not
supported.

Source provenance is immutable under
[`docs/migration/20260809-001-gocell-web-source-baseline.md`](docs/migration/20260809-001-gocell-web-source-baseline.md).

## Verification

Use Node.js 22 and pnpm 11.4.0:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```
