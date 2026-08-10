# WEB-PR-012 Runtime/Audit Home receipt

## Dependency and source

- WEB-PR-005, WEB-PR-006, and WEB-PR-011 were merged before this branch.
- RSS remained read-only at `b7f3e1d0bcc5b2e59639a81b4f37937914b53f00`; its existing untracked
  `target-plan/` and `xtask/tests/fixtures/platform_application_waist/` paths were not touched.
- Current Runtime/Audit hashes and the `unobserved` drift are recorded in the contract baseline.

## Delivered boundary

- `@rss/api/endpoints/runtime` and `@rss/api/endpoints/audit` own the two exact Admin coordinates and
  their declared error status/code/message/retryability/detail policies; drift fails closed.
- `@rss/runtime` strictly decodes the complete current Runtime Inventory envelope, including closed
  enums, mode-specific workflow activation, fingerprints, optional build metadata, listener
  coordinates, provider posture, and placements. The Home projection renders no endpoint or SPIFFE
  coordinate.
- `@rss/audit` strictly decodes only the ambient-tenant list page. It reuses the canonical cursor
  decoder without inventing a cursor/hasMore invariant absent from the contract, while enforcing
  safe integers and keeping entryHash opaque and projected fields unchanged.
- The single Web composition root creates both capability-scoped clients over
  `IdentitySession.transport`. Two Home
  panels load independently, abort on teardown/retry, discard stale generations, label RSS facts,
  clear failed data, and never fall back to mock/manual state. Network, timeout, and gateway failure
  on these idempotent reads offers only an explicit user retry.
- The Audit panel says “first entries”, not “latest”: the current contract starts at `seq=0` and
  offers no bounded tail coordinate. Cross-tenant Audit is not exposed.

## Security and tenant review

- Browser code sends no `X-Tenant-ID`, accepts no tenant input, parses no JWT, and derives no
  permission from profile kind or inventory facts.
- Both clients use the existing protected session transport; exact 401 recovery remains owned by the
  session. No panel performs automatic retry or creates a second session retry policy.
- The Home Audit projection omits actor, tenantId, and resourceId. Backend messages/details never
  enter presentation; requestId remains the only bounded diagnostic coordinate.
- Nginx exposes exact Runtime Inventory and ambient-tenant Audit entries routes. Cross-tenant Audit,
  Internal/Health/metrics, and Primary/Admin fallback remain absent.

## Four-principle check

- Thorough: strict current DTOs, both clients, independent UI states, cancellation, malformed data,
  source/error presentation, browser and Edge regression coverage.
- Breaking: current `unobserved` and error maps are adopted directly; no old Runtime enum/hash alias,
  alternate decoder, or dual source remains.
- Simple: two small domain adapters share one transport and use capability-scoped injection for two
  Home panels; no new route,
  registry, codegen, provider SPI, or real-environment harness.
- AI-HARD: exact records, closed enums, schemaVersion const, safe integers, typed endpoint owners,
  sealed source carriers, composition and scope guards make the boundary executable.

## Verification

- `pnpm install --frozen-lockfile`, typecheck, lint, format, unit, coverage, boundary, production build,
  browser, and Docker Edge gates passed locally.
- Unit: 490 tests / 56 files. Coverage: 448 tests / 50 files with every package threshold satisfied.
  Root boundary: 42 tests. Browser: 9 Chromium flows. Docker/Nginx Edge smoke passed.

## Changed-line classification

- Semantic handwritten: 912 changed lines.
- Tests, type checks, and boundary guards: 804 changed lines.
- Documentation, package, deployment, and boundary support: 259 changed lines.
- Lockfile: 32 mechanical workspace-importer lines.
- Generated: 0 lines.
- Pure deletion: 0 lines.

## Rollback

Do not restore the former `/api/v1/audit/**` Edge prefix. A feature rollback may remove the Runtime
and Audit packages, composition, and Home panels, but must retain the exact Audit entries location,
its negative Edge smoke/guard, and the current RSS assembly evidence in the Edge ADR. Run
`pnpm test:edge` after that scoped rollback; reverting this PR as one unit is unsafe because it would
re-expose the cross-tenant Audit route.
