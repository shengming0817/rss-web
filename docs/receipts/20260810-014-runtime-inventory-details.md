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
  server-authoritative authorization hint and the single protected session transport.
- Loading, malformed/error, cancellation, source labelling, and explicit user retry reuse the existing
  closed Web states. No stale, mock, or manual fallback is retained.

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

- Frozen install, full workspace typecheck/lint, 506 unit tests, 461 coverage tests, 45 root
  boundary tests, production build and built-identity scan all passed.
- Nine Chromium browser journeys passed, including Runtime navigation and absence of the raw fixture
  endpoint/SPIFFE coordinates. The Docker/Nginx Edge routing smoke passed without an Edge change.
- The first combined run found only Prettier drift in the newly edited root boundary assertion; it was
  formatted, then `pnpm format:check` and `git diff --check` passed. No behavioral correction was
  required after the full run.

## Changed-line classification

- Semantic handwritten code and locale content: 310 additions / 50 deletions.
- Tests, compile-time proofs, browser coverage, and boundary guards: 198 additions / 12 deletions.
- Documentation and governance: 93 additions / 4 deletions.
- Generated and lockfile: 0 lines.
- Total: 601 additions / 66 deletions.

## Rollback

Revert this PR as one unit to remove the details page, route, and safer facts projection. Do not
partially restore endpoint/SPIFFE fields to the public DTO, add a second decoder, or alter the closed
Edge route table. A rollback must rerun Runtime/Web type checks, unit tests, browser smoke, and the
boundary suite.
