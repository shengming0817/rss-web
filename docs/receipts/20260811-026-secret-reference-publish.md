# WEB-PR-026 — Secret Reference publish receipt

## Scope and provenance

- Issue: #34
- Implementation commit: `f55041eccb9ec7faacab0214bcfd73ae3a306fda`
- Web contract baseline: `b513d3390d73d4f291bb31afc588ca1307ce19af`
- Real journey RSS archive: `b7f3e1d0bcc5b2e59639a81b4f37937914b53f00`
- Independently inspected RSS object: `2fa78c4da110f60e1c0cc112b72f852c30f1dc9d`
- Active contract: `settings.secret-publish`, `POST /api/v1/settings/secrets`, exact `201`,
  non-idempotent, Primary listener, permission `settings.secret-publish`.
- SHA-256: contract
  `1bf3e4f3e3d1661f37d284e007c182f85109908b48233280b4155241ca08e8bd`; request
  `fe9adcdfa49c4ff53ad40d5747be81ef13179383f1e4b5a2233d6c251fde0e60`; response
  `14e986f2efd4a05d94423b425c61b8d71ec0eff1e08b75aefeb100f101c391a8`.
- The contract, request, response, generated binding, handler, and authorization vocabulary were
  byte-checked across the three named RSS revisions; the selected contract did not drift.

## Delivered boundary

- The existing `@rss/settings` client owns one strict Secret publish adapter over the single session
  transport. It accepts exact `key/storeId/refKey/refVersion?`, omits an empty optional refVersion,
  sends one `required-no-replay` request, accepts only exact 201, correlates the response key, and
  brands a positive safe-integer version.
- Secret Reference publish has an independent authenticated route and exact authorization intent. It
  does not share Config's GET reconciliation because RSS exposes no safe Secret metadata read.
- Prepare only validates required raw fields and opens an alertdialog. Confirm synchronously releases
  all four form fields, the private prepared request, and the reveal state before awaiting the single
  request. Public operation state never contains submitted coordinates.
- Success shows only the strictly decoded server key/version. Reviewed 4xx responses are final.
  Network, timeout, abort, protocol, malformed-success, and internal outcomes enter a terminal
  coordinate-free unknown state with no retry, reset, replay, or invented reconciliation.
- The endpoint error policy accepts only reviewed publish coordinates; an undeclared 404 is rejected
  as protocol drift and therefore enters the same terminal unknown posture.
- While a verified session owns a publishing or unknown operation, ordinary SPA navigation is
  blocked so the route cannot be remounted to bypass the terminal fence. Navigation to Login remains
  available for session expiry or sign-out, which establishes a new authority generation.
- Config, Policy, and Secret mutations share one app-owned commit-outcome classifier. The Settings
  aggregate client and call options live at the package root; Config and Secret keep only their DTOs
  and strict decoders, backed by one package-private exact wire primitive funnel.
- Store/reference coordinates are masked by default, have no copy action, and do not enter path,
  query, history, storage, logs, telemetry, errors, receipts, SourceMeta, or navigation authority.
- No Secret material is requested or decoded. There is no secret-resolve call, store/catalog
  discovery, tenant input, Admin fabrication, mock fallback, second Settings client, or RSS change.
- The existing Settings Nginx prefix continues to route to Primary. Edge smoke proves exact method,
  URL and body passthrough, Authorization preservation, browser tenant-header removal, safe access
  logs, and checked teardown.

## Four-principle result

- Thorough: strict request/response/error coordinates, key correlation, no-replay, sensitive lifetime,
  modal/focus behavior, terminal unknown outcomes, Edge routing, log leakage, and a real RSS 403 all
  have machine evidence.
- Breaking: one reference-only path and one state machine; no compatibility alias, fallback,
  material read, provider SPI, schema runtime, or alternate transport.
- Simple: one adapter method, one route, one operation, and the existing authorization/session/Edge
  seams; Config reconciliation remains separate.
- AI-HARD: branded response version, exact endpoint policy, compile-time public negatives, sealed
  session policy, coordinate-free state, request counts, source scans, artifact build, and archived
  real journey carry the rules.

## Verification

Final implementation commit verification completed locally from a clean worktree:

- frozen install, typecheck, lint, format check: passed
- coverage: 98 files / 950 tests passed
- root boundary: 10 files / 62 tests passed
- production build with both Preview flags forced true, identity scan, and Preview artifact scan:
  passed
- enabled demo Preview build: passed
- Chromium smoke: 18 passed
- Docker/Nginx Edge routing smoke and checked teardown: passed
- archived Web + pinned RSS real journey: all 10 phases passed, including the isolated
  `settings-config` phase proving one Secret POST, exact real 403, zero material requests, released
  DOM fields, no replay, and cleanup passed (`/tmp/rss-web-34-review-real-receipt.json`)
- `git diff --check`: passed

Two earlier canonical real-run attempts stopped in the pre-existing limited-account `main` journey
and both completed checked cleanup; the final run on the identical Web/RSS revisions passed every
phase. An earlier invocation with a misspelled source environment variable failed before setup as an
environment revision error and also cleaned up.

## Changed lines and rollback

- semantic/config: +664 / -67
- tests/type/Edge/real evidence: +727 / -34
- README/CLAUDE: +20 / -9
- implementation total: +1,411 / -110
- generated/lockfile: 0

Rollback is one revert of the PR. It removes the Secret endpoint owner, adapter, route, operation,
UI, tests, and documentation together while preserving existing Config operations, Preview gates,
the Settings Edge route, and the memory-only session owner.
