# WEB-PR-012 Runtime/Audit Home receipt

## Dependency and source

- WEB-PR-005, WEB-PR-006, and WEB-PR-011 were merged before this branch.
- RSS remained read-only at `b7f3e1d0bcc5b2e59639a81b4f37937914b53f00`; its existing untracked
  `target-plan/` and `xtask/tests/fixtures/platform_application_waist/` paths were not touched.
- Current Runtime/Audit hashes and the `unobserved` drift are recorded in the contract baseline.

## Delivered boundary

- `@rss/api/endpoints/runtime` and `@rss/api/endpoints/audit` own the two exact Admin coordinates.
- `@rss/runtime` strictly decodes the complete current Runtime Inventory envelope, including closed
  enums, mode-specific workflow activation, fingerprints, optional build metadata, listener
  coordinates, provider posture, and placements. The Home projection renders no endpoint or SPIFFE
  coordinate.
- `@rss/audit` strictly decodes only the ambient-tenant list page. It enforces safe integers and
  cursor/hasMore consistency while keeping entryHash opaque and projected fields unchanged.
- The single Web composition root creates both clients over `IdentitySession.transport`. Two Home
  panels load independently, abort on teardown/retry, discard stale generations, label RSS facts,
  clear failed data, and never fall back to mock/manual state.
- The Audit panel says “first entries”, not “latest”: the current contract starts at `seq=0` and
  offers no bounded tail coordinate. Cross-tenant Audit is not exposed.

## Security and tenant review

- Browser code sends no `X-Tenant-ID`, accepts no tenant input, parses no JWT, and derives no
  permission from profile kind or inventory facts.
- Both clients use the existing protected session transport; exact 401 recovery remains owned by the
  session. 403/500/503/protocol errors do not trigger a second retry policy.
- The Home Audit projection omits actor, tenantId, and resourceId. Backend messages/details never
  enter presentation; requestId remains the only bounded diagnostic coordinate.
- Nginx's existing exact Runtime and Audit Admin routes remain unchanged. Internal/Health/metrics and
  Primary/Admin fallback remain absent.

## Four-principle check

- Thorough: strict current DTOs, both clients, independent UI states, cancellation, malformed data,
  source/error presentation, browser and Edge regression coverage.
- Breaking: current `unobserved` and error maps are adopted directly; no old Runtime enum/hash alias,
  alternate decoder, or dual source remains.
- Simple: two small domain adapters share one transport and feed two Home panels; no new route,
  registry, codegen, provider SPI, or real-environment harness.
- AI-HARD: exact records, closed enums, schemaVersion const, safe integers, typed endpoint owners,
  sealed source carriers, composition and scope guards make the boundary executable.

## Verification

- `pnpm install --frozen-lockfile`, typecheck, lint, format, unit, coverage, boundary, production build,
  browser, and Docker Edge gates passed locally.
- Unit: 473 tests / 55 files. Coverage: 431 tests / 49 files with every package threshold satisfied.
  Root boundary: 42 tests. Browser: 8 Chromium flows. Docker/Nginx Edge smoke passed.

## Changed-line classification

- Semantic handwritten: 727 lines.
- Tests, type checks, and boundary guards: 568 lines.
- Documentation, package, deployment, and boundary support: 238 lines.
- Lockfile: 32 mechanical workspace-importer lines.
- Generated: 0 lines.
- Pure deletion: 0 lines.

## Rollback

Revert this PR as one unit. Rollback removes both new packages and Home panels without changing the
Identity session, same-origin Edge, contract-history evidence, or restoring any historical surface.
