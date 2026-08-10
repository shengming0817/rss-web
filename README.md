# RSS Web

RSS Web is the browser client for RSS. It is being migrated through small,
independent pull requests from a verified historical source snapshot.

The repository contains the reusable application shell, theme, i18n,
accessibility, tests, and the narrow HTTP transport in `@rss/api`. Historical
business routes, generated contracts, administration and observability screens,
Devboard, and old generation tools remain physically removed. RSS capabilities
return only through reviewed issues backed by selected RSS contracts.

The reviewed RSS contract selection is pinned in
[`docs/contracts/20260809-current-rss-baseline.md`](docs/contracts/20260809-current-rss-baseline.md).
It is audit evidence, not a runtime registry or a copy of backend contracts.

`@rss/identity` provides strict DTO decoding, an injected API adapter, and a
framework-neutral memory-only session controller. Only a successful
authenticated profile verification creates subject/tenant/kind authority.
Concurrent protected-request 401s share one refresh rotation and retry once;
terminal failures atomically clear the in-memory session. Tokens are never
persisted or exposed through public state. The Web composition root creates one
same-origin session, routes anonymous reloads to `/login`, and enters the shell
only after verified profile authority exists. Login accepts no tenant input;
logout and logout-all clear local authority before remote confirmation.

`@rss/authorization` provides closed, non-authoritative UX hints. Its production mode always
defers to the real RSS request, and its separate Preview entry can only supply explicitly enabled
dev/test/demo scenarios. It does not evaluate ABAC, create request authority, or override a real
403.

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
