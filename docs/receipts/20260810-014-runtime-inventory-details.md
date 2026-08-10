# WEB-PR-014 Runtime Inventory details receipt

## Dependency and source

- WEB-PR-013 and its real RSS journey were merged before this branch.
- The consumed fact source remains the read-only RSS revision
  `b7f3e1d0bcc5b2e59639a81b4f37937914b53f00`.
- Contract: `contracts/http/runtime/v1/inventory/contract.toml`, SHA-256
  `5e9e8df12de3fa2962b08a13f64716209f303d12465f6a851bb112e8256ddce5`.
- Response schema: `contracts/http/runtime/v1/inventory/response.schema.json`, SHA-256
  `b6f6f369a34ec843124ec5b331d7a5126369a6990167b53bdacd9af318f6dbec`.
- This receipt is review evidence, not a runtime registry or a copied backend contract.

## Delivered boundary

- `@rss/runtime` strictly validates schema version 1, fingerprints, optional build metadata, domains,
  listeners, provider posture, mode-specific workflow activation, and placements. Unknown fields,
  enums, schema versions, malformed values, and duplicate semantic identities fail closed.
- The public facts DTO cannot represent listener endpoints, placement endpoints, or SPIFFE identities.
  Raw coordinates are validated and discarded in the decoder rather than being passed to components.
- The authenticated `/runtime` route displays the reviewed fact groups and the known current
  `providerPosture.state=unobserved` value. Build metadata is labelled as a launch declaration, not
  browser verification of an artifact.
- Home links to the page through the existing route-metadata navigation. The route uses the existing
  server-authoritative authorization intent for both navigation and the actual request, so an exact
  sanitized 403 invalidates the matching local hint and records the final denial. It continues to use
  the single protected session transport.
- Loading, malformed/error, cancellation, source labelling, and explicit user retry reuse the existing
  closed Web states. A retry keeps its control mounted, disabled, busy, and focused while pending,
  then focuses the page heading after success. No stale, mock, or manual fallback is retained.

## Security and tenant review

- Inventory facts never become request, tenant, permission, deployment, or listener-discovery
  authority. The browser sends no tenant selector or controlled header.
- The page has no copy action for deployment coordinates. Its public input type excludes endpoint,
  host/port, and SPIFFE fields, and browser coverage proves raw fixture coordinates are absent.
- The existing Edge still exposes only exact `/api/v1/runtime/inventory` on Admin. This change adds no
  Internal, Health, metrics, listener discovery, cross-origin origin, or fallback route.
- Backend messages/details and raw malformed bodies remain outside presentation.

## Four-principle check

- Thorough: complete strict wire validation, safe projection, every reviewed fact group, closed states,
  cancellation, navigation, i18n, and browser regression coverage.
- Breaking: the current `unobserved` enum is accepted directly; endpoint-bearing public DTOs and old
  aliases are not retained.
- Simple: one existing client, one projection, and one page; no SDK, registry, codegen, store, schema
  copy, or Edge change.
- AI-HARD: exact decoders, closed carriers, semantic uniqueness, negative public type proofs, route
  metadata, and browser absence assertions make the safety boundary executable.

## Verification

- Frozen install, full workspace typecheck/lint, 508 unit tests, 463 coverage tests, 45 root
  boundary tests, production build and built-identity scan all passed.
- Ten Chromium browser journeys passed, including Runtime navigation, exact forbidden sanitization,
  one shell main landmark, and absence of the raw fixture endpoint/SPIFFE coordinates. The
  Docker/Nginx Edge routing smoke passed without an Edge change.
- The pre-commit combined run found only Prettier drift, but its `git grep` owner guard could not see
  the then-untracked page. Post-commit CI and review exposed that evidence gap. The final tracked-head
  combined run passed frozen install, every gate above, Edge teardown, format, and diff checks.

## Review remediation

- The built-in review found four in-scope gaps: the new RSS source owner was absent from the closed
  owner list; the page nested a second main landmark; retry removed its focused control; and the
  request did not yet pass through the route's authorization intent owner.
- One concentrated fix registered the exact source owner, changed the page root to a labelled
  section, added recovery busy/focus behavior, and introduced one frozen Runtime intent consumed by
  both router and request execution. Component, boundary, browser, and final full validation were
  rerun on the corrected head.

## Changed-line classification

- Semantic handwritten code and locale content: 340 additions / 51 deletions.
- Tests, compile-time proofs, browser coverage, and boundary guards: 338 additions / 13 deletions.
- Documentation and governance: 107 additions / 4 deletions.
- Generated and lockfile: 0 lines.
- Total: 785 additions / 68 deletions.

## Rollback

Revert this PR as one unit to remove the details page, route, and safer facts projection. Do not
partially restore endpoint/SPIFFE fields to the public DTO, add a second decoder, or alter the closed
Edge route table. A rollback must rerun Runtime/Web type checks, unit tests, browser smoke, and the
boundary suite.
