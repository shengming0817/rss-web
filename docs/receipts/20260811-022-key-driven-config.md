# WEB-PR-022 key-driven Config receipt

## Source and contract boundary

- Implementation starts from merged WEB-PR-021 at
  `a7524f26ae2a57225adf4a5ca74ed5c901c35f0f`.
- The bounded real journey archives RSS revision
  `b7f3e1d0bcc5b2e59639a81b4f37937914b53f00`; read-only comparison with current RSS
  `d68d21b2d7866bff2d962e098f2a07ae985d50a2` found the three selected contract/schema bytes
  unchanged.
- Contract TOML SHA-256 values for publish, get, and delete are respectively
  `263986f861f65d2f0d51d37cad83d2829776b0d6991d23396b4666d631e4dab0`,
  `1c80e3394db279cc4bf1a5170030b978331721e81bd4108ab4ad9d4d09070fe4`, and
  `1793c84bcc12999c6d0cd92557d25d6fdd08e117e7b1a21fec1965b4b52abe64`.
- Request/response hashes remain the selected baseline values. No RSS schema copy, runtime parser,
  catalog/history provider, mock fallback, or backend issue was added.

## Delivered boundary

- `@rss/api` owns the exact POST publish, GET by key, and DELETE by key coordinates plus reviewed
  validation/not-found/conflict/outbox/payload/internal WireError policies. Undeclared or drifting
  error coordinates fail closed as protocol errors.
- `@rss/settings` owns exact DTOs, strict response decoders, positive safe versions, response-key
  correlation, and the single injected client. Publish uses protected no-replay; get and delete use
  only the existing session owner's exact-401 recovery. Delete accepts exact 204 and has no decoder.
- The Web accepts only an explicitly entered key. Publish and delete require confirmation that names
  that key; neither confirmation nor receipt includes the Config value. GET facts are marked RSS,
  drafts are manual, and error/unknown states are unavailable.
- A publish network, timeout, abort, malformed success, protocol, or internal failure is treated as an
  unknown outcome without replay. The value draft is released before the request settles, and the
  only reconciliation action is an explicit GET.
- There is no recent-key list, catalog/history inference, optimistic state, automatic retry, tenant
  selector, browser-authored authority header, direct Axios path, or fallback data source.

## Value and authority safety

- Values exist only in the local draft, the exact publish body, or an explicitly revealed decoded GET
  result. They do not enter URLs, navigation/query state, storage, logs, telemetry, errors, receipts,
  or SourceMeta.
- The three operations have independent authorization UX intents, but all requests still reach RSS
  for final authorization. Browser code neither authors bearer/tenant headers nor infers Admin.
- The pinned browser login establishes User authority. The isolated real `settings-config` phase
  therefore proves final RSS 403 for get, publish, and delete instead of fabricating Admin success.
- Nginx Edge smoke proves exact methods and paths, publish body bytes, Primary routing, bearer
  pass-through, forged tenant removal, listener isolation, and checked teardown.

## Verification and evidence history

- Frozen install, workspace typecheck, lint, format check, 890 unit/root tests, 832 coverage tests, 58
  boundary tests, production build, built-identity scan, and diff check passed.
- Eighteen default Chromium journeys passed, including publish, explicit read/reveal/hide, and 204
  delete with no retained publish value or browser-authored tenant header.
- Docker/Nginx Edge smoke passed the exact Config routes and checked teardown.
- The final post-review real runner archived clean Web implementation
  `4e0985227df0e3b51c4a08609b2f16378240d68c`. Main, password-change, account-status-self, roles,
  policies-write, settings-config, rate-limited, budget-exhausted, Admin-down, and Primary-down phases
  passed; cleanup passed. Machine receipt: `/tmp/rss-web-30-review-real-receipt.json`.
- The first Config real phase reused the account changed by the earlier password phase and failed at
  login; it cleaned up successfully. The phase was corrected to use its own unchanged limited account,
  without weakening final 403 assertions. The first full gate then exposed only a missing
  `settings-config` entry in the static plan expectation; synchronizing that guard closed the final
  run.
- Review closure made exact 401 and provider-unavailable responses final while keeping budget 503,
  network, timeout, abort, protocol, and internal failures commit-unknown; unknown outcomes now lock
  all writes until explicit GET reconciliation. It also preserved key bytes exactly, sealed the
  Config version brand, expanded production-owner leakage discovery, and disabled text assistance on
  the value input. The complete gate and archived real journey were rerun after these changes.

## Four-principle check

- Thorough: exact contracts/errors, strict DTOs, session replay policy, value lifecycle, explicit
  reconciliation, browser, Edge, and real RSS evidence close together.
- Breaking: one current Settings adapter and page, with no legacy config package, compatibility alias,
  dual authority, optimistic model, or fallback.
- Simple: reuse the existing API funnel, session transport, authorization context, source badges,
  modal, safe error projection, and Settings Edge prefix.
- AI-HARD: exact-record decoding, key correlation, no-replay/session behavior tests, value-leakage
  scans, generation/abort fences, archived inputs, and checked teardown mechanically enforce the
  boundary.

## Changed-line classification

- Semantic handwritten code, locales, and docs: 955 additions / 4 deletions.
- Unit/type/boundary/browser/Edge/real tests and harness: 714 additions / 8 deletions.
- Lockfile: 16 additions / 0 deletions; generated code: 0 lines.
- Implementation total excluding this receipt: 1,685 additions / 12 deletions.

## Rollback

Revert this PR as one unit. That removes the three endpoint coordinates, `@rss/settings`, Config page,
navigation/intents, browser/Edge/real proof, and consumption note while preserving the previous
Policies slice. Do not retain a partial direct transport, value cache, recent-key list, mock fallback,
or compatibility path. Then rerun typecheck, boundary tests, Chromium, Edge, and the bounded real
journey.
