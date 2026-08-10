# WEB-PR-011 shell, source, and safe state receipt

## Dependency and source

- WEB-PR-010 / PR #41 was merged before this branch was created.
- RSS remained read-only. This slice consumes no new endpoint or schema and creates no backend issue.
- Existing Identity session and authorization owners remain unchanged: Identity owns 401 recovery and
  the Web authorization experience records only exact sanitized RSS 403 outcomes.

## Delivered boundary

- `@rss/shared` owns the closed `SourceMeta` discriminated union and its five sealed, frozen display
  constants. RSS is authoritative only for the reviewed displayed fact; mock, manual, external, and
  unavailable are non-authoritative, mock alone is Preview, and direct object-literal construction or
  invalid combinations fail TypeScript. A root guard keeps RSS-labelled production owners explicit.
- `SourceBadge` renders all five kinds as visible localized text. The current verified-profile Home
  slice is labelled RSS; no Preview data or future business page was introduced.
- Sidebar and Command Palette receive one list derived from implemented route metadata. The exact
  production navigation set is Home. Login is standalone; removed/draft/future capabilities have no
  route metadata or menu entry.
- A protected lazy catch-all renders a focusable 404 inside the shell. Anonymous unknown paths are
  session-gated to Login first, so protected routing is not disclosed before verified authority.
- `ContentState` replaces the historical capability-specific `UnavailablePanel` with closed loading,
  empty, and unavailable presentation. Retry is an emitted user action, never an automatic request.
- `toSafeErrorPresentation` accepts only branded `RssApiError`; reusable `ErrorPage` can receive only
  a closed kind, code, retryability, recovery action, and optional requestId. Backend message,
  safeDetails, response, headers, credentials, and request bodies cannot cross its public prop type.
  RequestId is the only copyable diagnostic coordinate.

## Security, tenant, and source review

- Source metadata never affects route access, headers, tenant selection, session state, authorization,
  or whether a real request executes.
- There is no mock/manual fallback and no merged RSS/mock list. Unavailable carries no stale rows.
- The shell parses no JWT, profile kind, tenant input, permission model, contract registry, or runtime
  discovery. The Nginx Edge remains the only tenant bootstrap and listener routing owner.
- 5xx uses closed local text and exposes no backend message/details. 401/403 behavior remains with the
  existing owners rather than a second error interceptor.
- The API WireError boundary accepts copyable request IDs only as 1–128 printable ASCII characters;
  malformed, control-character, bidi, or oversized coordinates fail closed as protocol errors. Copy
  feedback is fenced to the current request ID/code so late clipboard completion cannot relabel a
  newer diagnostic.

## Four-principle check

- Thorough: one implemented navigation source, protected catch-all, five source labels, closed content
  and error states, i18n/a11y tests, and physical removal of the stale unavailable component.
- Breaking: no `UnavailablePanel` alias, historical route, reserved menu, draft capability, or fallback.
- Simple: route metadata derives navigation; one shared provenance union and small presentation-only
  components serve later domain slices without a provider SPI or state framework.
- AI-HARD: discriminated source types, error props without raw data, exact route/navigation guards,
  locale-schema tests, and component behavior tests make the boundary executable.

## Verification

- `pnpm -F @rss/shared typecheck`
- `pnpm -F @rss/core test --run && pnpm -F @rss/core typecheck`
- `pnpm -F @rss/web test --run && pnpm -F @rss/web typecheck`
- root route, scope, identity, Edge, and ESLint boundary checks
- repository install, typecheck, lint, format, tests, coverage, build, browser, and Edge gates

Final local results: 436 tests passed across 48 files; 394 coverage tests passed across 42 files with
all package thresholds satisfied; 42 root boundary tests, production build, six Chromium flows, and
the Docker/Nginx Edge smoke passed.

The built-in three-reviewer pass produced seven raw findings and six unique findings: two P1 and four
P2, comprising one Cx3 sealed-source boundary and five Cx2 accessibility, diagnostics, typing, and
asynchrony defects. The first original-reviewer check found two direct repair regressions: an invalid
ARIA name and an overly broad internal source-shape cast/aggregate bypass. Both were removed and the
aggregate verification rerun before the final original-reviewer check.

## Changed-line classification

- Semantic handwritten: 577 lines.
- Tests, type checks, and boundary guards: 515 lines.
- Documentation, package, deployment, and boundary support: 115 lines.
- Lockfile: 6 mechanical workspace-dependency lines.
- Generated: 0 lines.
- Pure deletion: 79 lines for the stale `UnavailablePanel` implementation and tests.

## Rollback

Revert this PR as one unit. Rollback removes SourceMeta consumption, real route-derived navigation,
safe state/error presentation, and the protected 404. It must not restore historical routes,
`UnavailablePanel`, placeholder menus, mock fallback, or any second session/authorization owner.
