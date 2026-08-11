# WEB-PR-023 Config rollback receipt

## Source and contract boundary

- Implementation starts from merged WEB-PR-022 at
  `255cdccb35e1ca99356ddb1ed11393bd8088f9a0`.
- The bounded real journey archives RSS revision
  `b7f3e1d0bcc5b2e59639a81b4f37937914b53f00`; read-only comparison with reviewed current RSS
  `d68d21b2d7866bff2d962e098f2a07ae985d50a2` found the selected contract and schemas unchanged.
- Contract, request, and response SHA-256 values are respectively
  `eca423d9cac582b11933f297f1fb9f32dfb04515d1492850dd94474cf868a31e`,
  `b1b103d5b13511051dbe696dec31cf0c6f1c07ed1408a2a99e89a5afe4001396`, and
  `ea545bdbaa7995e0f366a0df1c99dad73b379563098aea2bfad98cf8b7874766`.

## Delivered boundary

- `@rss/api` owns exact POST `/api/v1/settings/configs/{key}/rollbacks`, success 201, and reviewed
  validation/not-found/version-or-outbox-conflict/payload/internal error coordinates.
- `@rss/settings` owns the exact positive-safe-integer request, strict receipt decoder, key and
  sourceVersion correlation, and protected no-replay call. Exact 401 invalidates the session without
  refresh or replay.
- The existing Config page accepts only a manually entered key and canonical positive decimal source
  version. The alertdialog repeats only those coordinates; there is no history value, candidate,
  automatic selection, or current-version inference.
- Success displays only key, sourceVersion, and the newly appended version. The server remains the
  final authorization and data authority.

## Outcome and privacy safety

- Network, timeout, abort, protocol, malformed success, internal failure, and shared budget-unavailable
  outcomes are unresolved. The single Config operation fence locks publish, delete, rollback, key,
  version, and reset while reconciliation is pending or failed; only an authoritative same-key GET
  success unlocks writes.
- Reviewed 404/409 and other exact server rejections are final, editable errors. No automatic retry,
  replay, fallback, optimistic receipt, or compensating write exists.
- Config values never enter the rollback request, confirmation, receipt, URL, storage, logs,
  telemetry, errors, or SourceMeta. Tenant and Authorization headers remain owned by Edge/session.

## Verification

- Frozen install, workspace typecheck, lint, format check, 905 unit/root tests, 847 coverage tests,
  58 boundary tests, production build, built-identity scan, and diff check passed.
- Eighteen Chromium journeys passed, including explicit rollback confirmation, exact request body,
  strict 201 receipt, and value absence from confirmation, URL, and storage.
- Docker/Nginx Edge smoke passed exact rollback path/body, Primary routing, bearer pass-through,
  forged tenant removal, listener isolation, and checked teardown.
- The real runner archived clean Web implementation
  `3e81f78c4c86789312f189cbefd421d2160d767e`. Main, password-change, account-status-self, roles,
  policies-write, settings-config, rate-limited, budget-exhausted, Admin-down, and Primary-down phases
  passed; cleanup passed. The settings-config phase records final RSS 403 for get, publish, rollback,
  and delete under the real User authority. Machine receipt: `/tmp/rss-web-31-real-receipt.json`.

## Four-principle check

- Thorough: exact contract/errors, strict DTOs, no-replay, correlation, unresolved fencing, browser,
  Edge, and real RSS evidence close together.
- Breaking: only the current active v6 contract is enabled; no compatibility alias, history provider,
  mock fallback, or alternate backend exists.
- Simple: the slice reuses the existing endpoint funnel, Settings adapter, single Config operation,
  page, modal, Edge prefix, and real phase.
- AI-HARD: exact-record decoding, safe-integer and coordinate correlation, session behavior tests,
  a single unresolved owner, dynamic leakage discovery, and archived inputs mechanically enforce the
  boundary.

## Changed-line classification

- Semantic handwritten code, locales, and docs: 364 additions / 69 deletions.
- Unit/type/boundary/browser/Edge/real tests: 229 additions / 11 deletions.
- Lockfile and generated code: 0 lines.
- Implementation total excluding this receipt: 593 additions / 80 deletions.

## Rollback

Revert this PR as one unit. That removes the rollback endpoint, DTO/decoder/client method, operation
states, intent, confirmation UI, browser/Edge/real evidence, and consumption note while preserving
WEB-PR-022 Config publish/get/delete. Do not retain a partial rollback transport, history selector,
mock candidate, or compatibility path. Then rerun typecheck, boundary tests, Chromium, Edge, and the
bounded real journey.
