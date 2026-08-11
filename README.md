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
The implemented Identity self-service route reuses the verified profile and session controls and adds
one password-change form. Password fields remain component-local and are released immediately after
submission. The non-idempotent command is sent once; confirmed success or an unknown commit result
clears local authority instead of replaying or calling logout-all as compensation.
The separate Account Status route accepts only an explicit canonical `userId`, then reads or submits a
closed desired state to RSS. It has no directory/provider/mock seam and never treats the resource ID as
tenant or principal authority. Self-target non-active changes and uncertain write outcomes clear local
session authority rather than preserving a possibly revoked bearer.
The Roles route requests an opaque server role catalog and accepts only explicit roleId/subject
binding commands. Assign is non-idempotent and never replayed; revoke is idempotent. Permissions are
display facts rather than effective authority, and command receipts never become a current binding
view or local history. The pinned RSS browser-login authority is `user`, while these routes require
`admin`, so the real journey records the current server-authoritative 403 instead of fabricating an
Admin bearer; success shapes remain covered at the adapter, component, and Edge boundaries. No
subject directory, picker, provider, tenant input, or mock fallback exists.

The Policies route consumes active list/detail reads and create/update/deactivate writes through the
same protected session transport.
It uses strict handwritten DTOs for the current family/predicate/typed-operand ABAC shape, explicit
cursor pagination, and a distinct server detail request after selection. Policy content, profile kind,
and displayed obligations are facts only: the browser never evaluates them or derives effective
authority. Update/deactivate use versions captured from decoded server detail; a 409 or unknown outcome
retains the draft for explicit reconciliation and is never auto-submitted. Unknown schema fields, enum
values, operand-family mismatches, or unsafe integer values fail closed, with no legacy operator
aliases, schema copies, mock fallback, or runtime registry.

Role Bindings Preview is a separate app-local, static experience and is disabled by default. To
inspect its synthetic, permanently non-authoritative fixtures in development, run
`VITE_ROLE_BINDINGS_PREVIEW=true pnpm dev`. The route and navigation are registered only in the
closed `development`, `test`, or `demo` modes; production ignores the flag. Preview data never calls
RSS and never derives state from Roles command receipts.

Config Catalog Preview is also disabled by default. In development, test, or demo mode it can be
enabled with `VITE_CONFIG_CATALOG_PREVIEW=true pnpm dev`. Its `preview.example.*` rows are local
synthetic metadata marked Mock and non-authoritative. A row requires an explicit warning confirmation
before its key is copied once into the existing Manual Config draft; no RSS request occurs until the
user separately selects “Read current config”, and a real failure never falls back to Preview data.

Config History Preview is independently disabled by default and uses
`VITE_CONFIG_HISTORY_PREVIEW=true` in the same closed non-production modes. It shows only frozen,
synthetic key/version metadata: no historical value, diff, material, time, actor, or “current/latest”
claim exists. Explicitly confirming a candidate copies it once into the Manual rollback draft. The
candidate is not proof that a real version exists; the user must still prepare and confirm the real
rollback, and every real RSS result remains final without Mock fallback.

`@rss/authorization` provides closed, non-authoritative UX hints. The Web composition root installs
only its server mode, which always defers to the real RSS request. A Web-owned context lets future
routes and controls consume hints without treating them as security: operations still execute once,
and an exact sanitized RSS forbidden response invalidates the matching local hint and becomes the
final UX outcome. The separate Preview entry is test/demo input and remains forbidden in production
Web source. No browser ABAC evaluation, request authority, or legacy access endpoint exists.

The authenticated shell derives Sidebar and command-palette navigation from implemented route
metadata; currently that closed production set contains Home, Identity self-service, Account Status,
Roles, Policies, key-driven Settings Config, Secret Reference publish, Runtime details, and Audit
queries.
Removed and future capabilities
do not receive placeholder routes or menu entries. `@rss/shared` owns a discriminated `SourceMeta`
model with sealed, frozen display constants; direct object-literal construction is rejected. Reusable
badges make RSS, mock, manual, external, and unavailable sources visible without using source metadata
as request or permission authority. Generic content/error presentation accepts only reviewed status,
code, retryability, and requestId coordinates—never backend messages or details. Unknown protected
paths use the authenticated catch-all; anonymous requests still reach Login first.

The authenticated About page is a zero-network view of frozen build evidence: the Web image revision,
the reviewed RSS contract-baseline identity, and only the Preview experiences explicitly enabled by
the already production-gated composition flags. Build and baseline facts are External; Preview facts
remain Mock and non-authoritative. It does not discover runtime contracts, providers, listeners,
compatibility, or health. Degraded domain panels reuse one pure presentation component, while each
domain keeps its own operation state and must explicitly choose whether a user-triggered idempotent
read retry is allowed. Writes, audited target reads, unknown outcomes, and Secret Material never gain
a generic retry path.

`@rss/settings` provides the strict framework-neutral client for explicit Config publish, get,
delete, and rollback coordinates plus reference-only Secret publish and one-time Secret Material
resolve. Vue composition remains in
`apps/web`. Config publish and rollback are one-shot non-idempotent operations; an uncertain result
requires an explicit server read, and publish also drops the value draft. Rollback accepts only an
explicit Manual key/source-version coordinate, whether typed by the user or copied from the
non-authoritative Preview, and never infers real history. Secret publish has its own route and
terminal unknown-outcome state because no safe metadata read exists: it never resolves material,
replays a request, or invents reconciliation. Submitted Config values and Secret reference
coordinates are released and never placed in URLs, storage, logs, errors, receipts, or source
metadata. A separate high-risk reveal route requires an explicit confirmation, displays only the
strictly decoded Base64 for a 30-second lease, forces request and response no-store, and releases all
app-owned references on hide, expiry, navigation, hidden/pagehide, and unmount. Explicit clipboard
copy is outside the app's cleanup boundary; the app does not claim JavaScript zeroization. There is
no active catalog/history contract, provider, recent-key list, mock fallback, tenant selector,
secret-store discovery, automatic publish-to-resolve handoff, or direct Axios path.

`@rss/runtime` and `@rss/audit` provide strict, framework-neutral clients for the selected Admin
listener reads. The authenticated Home composes both over the single session transport and degrades
each panel independently. Runtime shows a small facts-only summary and links to a full reviewed-facts
page. Audit exposes explicit cursor pagination for the ambient session tenant and a separately
labelled target-tenant operation. Target tenant IDs are resource coordinates, never browser tenant
authority; each target page is an audited non-idempotent operation with no prefetch, automatic retry,
or 401 replay. PII fields remain absent until individually revealed and copied. Entry hashes stay
opaque and unverified. Safe idempotent reads offer only an explicit user retry after network, timeout,
or gateway failure. No listener discovery, deployment-coordinate exposure, hash verification, schema
copy, bulk export, or fallback source exists.

The production Nginx image is a minimal same-origin Edge with a closed
Primary/Admin route table; Audit exposes the ambient entries path plus the exact canonical target-tenant
path. It removes browser tenant headers and injects the
deployment-fixed tenant only for login and refresh. The Edge enforces a self-only
CSP and browser security headers, serves the SPA shell and theme initializer with
no-store, and grants one-year immutable caching only to generated hashed assets.
Preview fixtures and stock Nginx content are absent from the production image;
HSTS remains owned by the actual outer TLS terminator. See the
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
