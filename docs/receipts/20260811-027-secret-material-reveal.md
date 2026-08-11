# WEB-PR-027 — Secret Material Reveal receipt

## Scope and provenance

- Issue: #35
- Implementation commit and archived Web revision:
  `3a180209f346c7311cc2d66b1e756f0947933b71`
- Web contract baseline: `b513d3390d73d4f291bb31afc588ca1307ce19af`
- Real journey RSS archive: `b7f3e1d0bcc5b2e59639a81b4f37937914b53f00`
- Independently inspected RSS revision: `1f6c131f0759f921551a81e12e0adb0071346927`
- Active contract: `settings.secret-resolve`, exact
  `GET /api/v1/settings/secrets/{key}/material` → 200, idempotent, Primary listener,
  permission `settings.secret-resolve`.
- SHA-256: contract
  `c2b2a2b80464a020c57e7901b73e200c6891486ba5dbd5c042ba73c438b4ffa1`; request
  `170da93c84b0b1d752d0066d14e907766e106531e6f14e260db6a86073e7eb09`; response
  `bd8d7f235164904c435bf3ada4c9b39be7d926dca2def300309c05399bde2833`.
- Those selected files and the resolve handler are byte-identical across the baseline, real pin, and
  inspected revision. Unrelated runtime-plan/assembly-lock evolution was not used to repin this
  slice.

## Delivered boundary

- `@rss/api` owns a closed `cache: 'no-store'` request mode. Callers cannot forge cache, tenant, or
  authorization control headers. Secret Resolve declares exact 400/403/404/500 coordinates;
  endpoint-owned 403 validation rejects hostile details before the shared fallback, while canonical
  shared 401/429/503 behavior remains closed.
- The existing root `@rss/settings` client adds one `resolveSecret` method over the single session
  transport. It sends the encoded key path once with no body/query/caller headers, allows only the
  session owner's exact-401 recovery, and strictly accepts canonical Base64 without `atob`, UTF-8
  conversion, schema copies, or a second client.
- The independent `/settings/secret-material` route requires an explicit high-risk confirmation.
  Confirm clears the Manual key and prepared snapshot before awaiting the request. Public operation
  state and safe errors never contain the key or material.
- Material exists only in one route-scoped lexical reference and the active DOM for a fixed
  30-second lease. Manual hide, expiry, Escape, hidden/pagehide, route leave, session navigation, and
  unmount use the same abort/generation/clear funnel. This releases app-owned references; it does not
  claim physical JavaScript string erasure.
- Clipboard copy is explicit and generation-fenced. Its asynchronous continuation retains only the
  numeric generation, not a second app-owned material reference. The UI states that the
  operating-system clipboard is outside the app's cleanup boundary; there is no automatic copy,
  download, export, or clipboard overwrite.
- The exact Edge material location stays on Primary, disables proxy buffering, hides any upstream
  cache header, and emits one `Cache-Control: no-store` on success and failure. Neighbor Settings
  routes retain their existing behavior. The route also covers opaque keys whose encoded path
  segment contains a separator after Nginx normalization. Safe access logs contain
  method/status/requestId only, not URI, body size, key, or material.
- There is no publish-to-resolve handoff, secret/store discovery, Mock/Preview fallback, tenant input,
  material persistence, telemetry, runtime schema loading, RSS modification, or fabricated Admin
  authority.

## Four-principle result

- **Thorough:** strict success/error/session/cache behavior, Base64 boundaries, DOM/reference lease,
  clipboard, route lifecycle, Edge no-store, near misses, logs, and real RSS denial all have machine
  evidence.
- **Breaking:** the previous absolute material prohibition was replaced atomically by an exact owner
  set; there is no compatibility alias, fallback, duplicate route, or alternate transport.
- **Simple:** one endpoint, one method on the existing client, one route-scoped operation, one view,
  and the existing authorization/session/Edge composition.
- **AI-HARD:** branded Base64, exact decoder and errors, closed cache mode, material-free state,
  single clear funnel, owner scans, fake timers, generation fences, Docker smoke, and archived real
  evidence carry the constraints.

## Verification

Final implementation verification from the clean implementation commit:

- frozen install, typecheck, lint, format: passed
- coverage: 100 files / 988 tests passed
- root boundary: 10 files / 63 tests passed
- production build with both Preview flags forced true, RSS identity scan, and Preview absence scan:
  passed
- explicitly enabled demo Preview build: passed
- Chromium smoke: 19 passed, including a protected 200 path that proves confirmation-before-fetch,
  request no-store/no body/no tenant header, raw Base64 display, and hide/route cleanup
- Docker/Nginx Edge routing, no-store, near-miss, log, and checked teardown smoke: passed
- archived Web + pinned RSS real journey: all 10 phases and checked cleanup passed, including the
  isolated `settings-config` phase proving one Secret Resolve GET, exact real 403, request/response
  no-store, no tenant header, no replay, and no active material DOM
  (`/tmp/rss-web-35-review-real-receipt.json`)
- `git diff --check`: passed

The first run on the earlier archived Web/RSS revisions stopped in the pre-existing limited-account
`main` journey and completed checked cleanup before the new Settings phase. Its immediate rerun passed
all phases and cleanup. After review fixes, the full journey was run again on the final implementation
commit above and all 10 phases plus cleanup passed. The earlier receipts remain at
`/tmp/rss-web-35-final-real-receipt.json` and `/tmp/rss-web-35-final-real-receipt-2.json`.

## Changed lines and rollback

- semantic/config: +663 / -11
- tests/type/Edge/real evidence: +796 / -15
- README/CLAUDE/baseline note: +38 / -4
- implementation total: +1,497 / -30
- generated/lockfile: 0

Rollback is one revert of this PR. It removes the resolve endpoint/client method, Reveal route and
operation, exact Edge cache location, tests, and documentation together while preserving Secret
Reference Publish, Config operations, Preview gates, the broad Settings Edge route, and the sole
memory-only session owner.
