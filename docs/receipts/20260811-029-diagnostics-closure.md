# WEB-PR-029 — Degraded diagnostics and release metadata receipt

## Scope and provenance

- Issue: #37. All declared blockers #22–#26, #28, and #30–#36 were closed before
  implementation.
- Implementation commit: `013c0c33665573edac8018a0538243166fdaf4eb`.
- Base Web revision: `167ddb5ed89a8965f1f42c9367d56f8f19dba8e4`.
- Reviewed RSS contract baseline: `b513d3390d73d4f291bb31afc588ca1307ce19af`.
- Optional real-harness RSS archive: `b7f3e1d0bcc5b2e59639a81b4f37937914b53f00`.
- RSS was not modified. The three revisions above are distinct facts and are not
  runtime compatibility or health claims.

## Delivered boundary

- `@rss/core` now owns one pure degraded presentation that composes the existing
  Unavailable source badge and safe ErrorPage. Every caller explicitly selects
  `none` or `retryRead`; the component cannot send a request or infer replay authority
  from the server retryability flag.
- Runtime, Audit, Roles, Policies, Account Status, and Config reuse this presentation
  while retaining their existing loading, abort, generation, reconciliation, focus,
  target-audit, and no-replay owners. Ambient idempotent reads remain user-triggered;
  writes and audited reads do not gain generic retry.
- The authenticated `/about` route is a zero-network view of one frozen bootstrap
  object. It shows the strict Web build revision and reviewed RSS baseline as External
  evidence, and only explicitly enabled Preview experiences as Mock and
  non-authoritative. It performs no runtime provider, listener, contract, or health
  discovery.
- `RSS_WEB_REVISION` is the sole Vite compile-time Web revision input. Docker accepts
  the distinct `RSS_WEB_BUILD_REVISION`, validates it as a lowercase 40-character
  SHA, maps it into the Web build, and writes the same value to the OCI image revision
  label. CI, Edge, and the archived real harness pass the Web SHA explicitly; the RSS
  `GIT_SHA` remains separate.
- Existing WireError sanitation remains unchanged. Reusable UI receives only safe
  kind, code, retryability, recovery hint, and requestId; backend message/details and
  transport objects remain outside the presentation boundary.

## Four-principle result

- **Thorough:** component/type tests, cross-domain view tests, build-revision
  validation, zero-network About tests, navigation/source checks, Chromium, and real
  Docker/OCI correlation cover the changed joins.
- **Breaking:** duplicate Unavailable + ErrorPage compositions were replaced directly;
  no compatibility component, second DTO, release endpoint, discovery path, or fallback
  remains.
- **Simple:** one pure Core component, one app-local frozen metadata factory, and the
  existing bootstrap/Docker pipeline own the feature.
- **AI-HARD:** sealed SourceMeta values, a required closed recovery policy, strict
  production SHA validation, production-gated Preview inputs, boundary scans, and
  About DOM = Docker build arg = OCI label checks fail closed.

## Verification

Final implementation verification:

- workspace typecheck, lint, and format check: passed
- unit/root aggregate: 114 files / 1,070 tests passed
- coverage suites: 103 files / 989 tests passed
- root boundary: 11 files / 81 tests passed
- production build plus identity and Preview artifact scans: passed
- Chromium smoke: 20 passed; the authenticated navigation includes About, production
  shows no Mock sources, and its Web revision is a full 40-character SHA
- Docker/Nginx Edge smoke: passed; Chromium About revision, build argument, and OCI
  image label all equal `013c0c33665573edac8018a0538243166fdaf4eb`, with checked
  teardown
- `git diff --check`: passed

The single full local sequence initially reported one bounded browser regression: the
closed production navigation count still expected ten links after About became the
eleventh. The expectation and About assertions were updated together; the final full
Chromium suite passed 20/20. No product retry or session behavior changed.

The optional archived real journey was run from the clean implementation commit and
wrote `/tmp/rss-web-37-final-real-receipt.json`. It archived the exact Web revision
above and RSS `b7f3e1d0bcc5b2e59639a81b4f37937914b53f00`, but stopped in the
pre-existing `@main keeps real 403 authoritative for a limited account` scenario before
the Issue #37-specific phases. The machine receipt reports `product:main` failed and
cleanup passed for Compose project `rss-web-real-95365`; this is not claimed as passing
evidence and does not replace the required unit, Chromium, and real-Edge gates.

## Changed lines and rollback

- semantic/application/build: +414 / -75
- tests and executable evidence: +429 / -8
- documentation and rules: +24 / -0
- implementation total: +867 / -83
- generated files and dependency lock changes: 0

Rollback is one revert of this PR. It removes the About route, static release metadata,
dedicated Web revision attestation, and shared degraded presentation together. It does
not restore raw error details, automatic retries, runtime discovery, a second SourceMeta
model, or any closed Preview/provider path.
