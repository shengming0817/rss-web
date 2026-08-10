# WEB-PR-015 Audit pagination and target-tenant receipt

## Dependency and source

- WEB-PR-014 was merged before this branch; implementation base was
  `71a6c212cc47e884aa0bb365f539e8026f8c096d`.
- The consumed read-only RSS revision is
  `b7f3e1d0bcc5b2e59639a81b4f37937914b53f00`.
- `audit.list-tenant-entries` contract TOML SHA-256:
  `c60d51a58ca33da3b3d74e4779ca53250239d93c0a921d0163c44fc0f9dc5b79`.
- Request schema SHA-256:
  `36c75a1ecba6ecd027be66f5819bb02785b18007bd20674435a1e4e2705e81c0`.
- Response schema SHA-256:
  `c3f0b3e61b9574fc822262d4b1052045cae714b4c15570e239537b48d6f358c7`.
- These hashes are review evidence, not a runtime contract registry or copied schema.

## Delivered boundary

- `@rss/audit` owns one strict DTO/decoder/client surface for ambient and explicit target reads. A
  canonical lowercase, non-nil UUID is the only accepted target coordinate; neither API method
  accepts browser-authored auth or tenant headers.
- `@rss/api` adds the closed `required-no-replay` protected-session policy. It may establish a valid
  credential before the first send, but the target operation is sent exactly once. An exact sanitized
  401 invalidates that credential generation without recovery or replay.
- Ambient and target pagination use opaque server cursors, one in-flight request, abort/generation
  fencing, explicit next-page actions, and fail-closed repeated cursor/sequence checks. Target pages
  are never prefetched or automatically retried because each request is an audited non-idempotent
  RSS operation.
- The authenticated `/audit` route derives navigation and authorization hints from reviewed route
  metadata. It never infers SuperAdmin authority from verified profile kind; the real RSS response is
  final. A target 403 is sanitized, invalidates only its exact UX hint, and offers no retry fallback.
- Actor, resource, and returned tenant coordinates are absent from the DOM until separately revealed.
  Each field has its own copy action and async generation fence. There is no bulk export. Entry hashes
  remain visibly labelled opaque and browser-unverified.

## Edge and tenant review

- Nginx routes only exact ambient Audit and exact canonical target-tenant paths to Admin. Uppercase,
  nil, malformed, encoded-slash, trailing-slash, and extra-segment variants return 404 with no
  upstream traffic.
- All Audit routes remove `X-Tenant-ID`; the path target never becomes session or header authority.
  Authorization and body/query coordinates otherwise pass through unchanged, and Primary/Admin have
  no fallback to one another.
- Internal, Health, metrics, unknown API routes, cross-origin origins, listener discovery, and raw
  deployment coordinates remain inaccessible.

## Verification

- Frozen install, workspace typecheck, lint, format check, 534 unit/root tests, 488 coverage tests,
  46 root boundary tests, production build, and built-identity scan passed.
- Twelve Chromium journeys passed. They cover initial target idleness, explicit target submit/next,
  no browser tenant header, PII reveal boundary, exact single-call 403, no raw message, and the closed
  three-route navigation set.
- The Docker/Nginx Edge smoke passed with canonical target routing plus every negative path above and
  complete Compose teardown.
- The opt-in real RSS runner archived clean Web implementation commit
  `b4a76018c2dd2fcebe82d1c2c3c1d61d3ecbff15` and the pinned RSS revision. Main, request-budget
  exhaustion, Admin-down, and Primary-down phases all passed; cleanup passed. The real standard user
  target query produced one authoritative 403 through the production Edge without a second request.

## Four-principle check

- Thorough: both Audit coordinates, strict decoding, explicit cursor state, exact failure behavior,
  Edge routing, PII controls, browser coverage, and real RSS evidence are closed together.
- Breaking: there is one target shape and one session policy; no old route, tenant alias, permissive
  fallback, automatic retry, or double transport remains.
- Simple: one existing Audit package, one small pagination controller, one page, and one exact Edge
  route; no SDK, provider SPI, schema copy, client policy engine, or export subsystem was added.
- AI-HARD: closed session-policy types, exact endpoint owner, shared tenant validator, generation
  fences, strict tests, source-owner guards, real Nginx negatives, and archived real-backend evidence
  make the boundary executable.

## Changed-line classification

- Semantic handwritten code, locale content, and Edge configuration: 738 additions / 15 deletions.
- Tests, browser journeys, and boundary guards: 683 additions / 20 deletions.
- Documentation and governance: 40 additions / 17 deletions.
- Generated and lockfile: 0 lines.
- Implementation total: 1,461 additions / 52 deletions.

## Rollback

Revert this PR as one unit. A rollback removes the target route, page, pagination behavior, and
no-replay session policy together while preserving the previously merged ambient Home panel. Do not
partially retain the target Edge route with a replay-capable client, restore a tenant header, or add a
compatibility alias. Rerun API/Audit/Web type checks, boundary tests, Chromium, Edge smoke, and the
bounded real RSS journey after rollback.
