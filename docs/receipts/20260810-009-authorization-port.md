# WEB-PR-009 authorization port receipt

## Dependency and source

- Depends on WEB-PR-004 / PR #17 for the sole HTTP transport and sanitized WireError boundary.
- RSS was read-only at revision `b7f3e1d0bcc5b2e59639a81b4f37937914b53f00` during review.
- RSS ADR-025 is Accepted. The reviewed
  `contracts/components/identity/v1/common-abac-operator.schema.json` SHA-256 is
  `0a124adb46ca042dae2f3ebcc5baa44e3340da7d6999b6f3c4ee0e9f5405604b`.
- The schema and ADR are audit references only. They are not copied, parsed, loaded, or evaluated
  by the Web runtime.

## Delivered boundary

- `@rss/authorization` is a sealed, zero-runtime-dependency UX-hint capability.
- Server mode always returns `unknown / deferred-to-request` and invokes a real operation exactly
  once without wrapping its value or error.
- The separate Preview entry accepts only exact contract, permission, and optional resource
  selectors. Permission identifiers remain opaque RSS tokens rather than a duplicated frontend
  grammar. Duplicate, empty, wildcard, extra-field, or invalid scenarios fail during construction;
  extra-field lookup intents fail closed to `unknown`.
- Every Preview result is `authoritative: false`; unmatched and invalid requests are `unknown`.
- The production app cannot import the Preview entry. This PR does not wire route, menu, or button
  behavior; that belongs to dependent WEB-PR-010.

## Security and tenant review

- Intent has no tenant, principal, role, JWT, policy, PIP attribute, or arbitrary ABAC input.
- The package sends no request, adds no header, stores no hint, and owns no retry or session logic.
- Preview allow/deny never short-circuits an operation. A real 403 remains the same error object and
  is the final authorization result.
- There is no `/access/decide`, permission map, PDP client, compatibility alias, dual backend, or
  external provider SPI.

## Changed-line classification

- Semantic handwritten: 211 lines.
- Tests and type/boundary guards: 256 lines.
- Documentation, package, and boundary support: 162 lines.
- Lockfile: 9 mechanical lines for the new workspace importer.
- Generated: 0 lines. Pure deletion: 0 lines.

## Verification

- `pnpm -F @rss/authorization test`
- `pnpm -F @rss/authorization typecheck`
- `pnpm exec vitest run --project root eslint.config.spec.ts`
- repository typecheck, lint, format, tests, coverage, boundary, and build gates

The built-in two-reviewer pass found and closed three Cx2 gaps: exact runtime object shape,
opaque permission-token compatibility with the selected RSS Settings contracts, and JS/MJS
coverage for the production Preview import ban.

Final local results: 374 tests passed across 42 files; 335 coverage tests passed across 36 files
with every package threshold satisfied; root boundary, production build, five Chromium flows, and
the Docker/Nginx Edge smoke passed. The aggregate shell command reached its 120-second execution
limit while the final Edge smoke was running; the same `pnpm test:edge` command then completed
successfully in isolation. This was an orchestration time limit, not a product assertion failure.

## Rollback

Revert the PR as one unit. No application composition consumes the port in this slice, so rollback
removes the package and its governance entries without changing HTTP, session, tenant, or UI
behavior. Do not replace it with a restored legacy access client or permission map.
