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

`@rss/authorization` provides closed, non-authoritative UX hints. The Web composition root installs
only its server mode, which always defers to the real RSS request. A Web-owned context lets future
routes and controls consume hints without treating them as security: operations still execute once,
and an exact sanitized RSS forbidden response invalidates the matching local hint and becomes the
final UX outcome. The separate Preview entry is test/demo input and remains forbidden in production
Web source. No browser ABAC evaluation, request authority, or legacy access endpoint exists.

The authenticated shell derives Sidebar and command-palette navigation from implemented route
metadata; currently that closed production set contains Home and the implemented Runtime details
page. Removed and future capabilities
do not receive placeholder routes or menu entries. `@rss/shared` owns a discriminated `SourceMeta`
model with sealed, frozen display constants; direct object-literal construction is rejected. Reusable
badges make RSS, mock, manual, external, and unavailable sources visible without using source metadata
as request or permission authority. Generic content/error presentation accepts only reviewed status,
code, retryability, and requestId coordinates—never backend messages or details. Unknown protected
paths use the authenticated catch-all; anonymous requests still reach Login first.

`@rss/runtime` and `@rss/audit` provide strict, framework-neutral clients for the selected Admin
listener reads. The authenticated Home composes both over the single session transport and degrades
each panel independently. Runtime shows a small facts-only summary and links to a full reviewed-facts
page; Audit shows the first
server-ordered page and explicitly does not claim it is a latest/tail view. Safe idempotent reads
offer only an explicit user retry after network, timeout, or gateway failure. No tenant selector,
cross-tenant read, listener discovery, deployment-coordinate exposure, hash verification, schema
copy, or fallback source exists.

The production Nginx image is a minimal same-origin Edge with a closed
Primary/Admin route table; Audit exposes only the ambient-tenant entries path. It removes browser tenant headers and injects the
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

The bounded real-backend acceptance is opt-in because it builds an ephemeral RSS demo stack and
requires Docker plus a local RSS checkout containing the pinned revision. It reads that checkout
only through `git archive`; it also requires a clean Web checkout and builds an archived Web HEAD
rather than live working-tree bytes. The runner seeds only disposable PostgreSQL volumes, sends the
browser exclusively through the production Nginx Edge, and verifies teardown of the exact Compose
project and volumes:

```bash
RSS_SOURCE_DIR=/absolute/path/to/rss pnpm test:e2e:real
```

The command has a 30-minute setup/product deadline, phase/listener readiness fences, and handled
SIGINT/SIGTERM cleanup. Teardown has its own 120-second recovery budget so the main deadline cannot
prevent cleanup. It
distinguishes preflight/runner/cleanup failures from product assertions and can write a machine
receipt outside the repository with `RSS_WEB_REAL_RECEIPT=/absolute/path/receipt.json`. A failed
cleanup exits non-zero and records the Compose project plus recovery path instead of claiming pass.
See the [WEB-PR-013 receipt](docs/receipts/20260810-013-real-rss-journey.md).
