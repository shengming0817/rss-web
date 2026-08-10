# WEB-PR-017 Account Status management receipt

## Dependency and source

- WEB-PR-016 was merged before this branch; implementation base was
  `07d9c28ce1c5d8a1ceb82c40e331ace447e9767b`.
- The consumed clean, read-only RSS revision is
  `b7f3e1d0bcc5b2e59639a81b4f37937914b53f00`.
- `identity.account-status-get` contract/request/response SHA-256 values are
  `f16b94f6991e9fa319d3f87d753bd85509258587144434d191a95c81ee2d942f`,
  `ea1cad270e9cbacbab52d3a3f50532fe80f108005fdc1e2d8262ed1c780a6688`, and
  `6ca8313a01a539d1081ada55b1bd152632060a3490fa5d0d483726299d11ebf1`.
- `identity.account-status-set` contract/request/response SHA-256 values are
  `6b5c5996b1852b72d571adc766b1fdd0d108919f901ef55800b14feda35b7c70`,
  `accda8ebb305f9669b3a92ad578675331e7af14f99088bb570b9d611d72f7147`, and
  `ddb3918bb8c739f61416d66fc8a712f42ef53e63672ab32a20e25d1a29ac3395`.
- Hashes are review evidence only; no schema copy, runtime parser, descriptor registry, directory
  provider, or backend issue was added.

## Delivered boundary

- `@rss/identity` owns exact GET/PUT DTOs, strict response decoders, canonical non-nil UUID
  validation, and one injected Account Status adapter. The request cannot express headers, tenant
  authority, principal authority, or fields outside the closed desired-state envelope.
- GET and idempotent PUT use the one protected session transport. Exact 401 recovery remains owned by
  that transport, but network, timeout, conflict, server, and protocol outcomes are never
  automatically retried. The one exception is the session owner's exact 401 recovery and one replay,
  which is safe only because the RSS contract explicitly marks this desired-state PUT idempotent. Two
  reviewed RSS 409 wire coordinates share one endpoint status without a permissive fallback; every
  undeclared or drifted coordinate fails closed.
- The Web operation begins request-free, accepts one explicitly typed `userId`, clears old facts when
  the coordinate changes or an error occurs, requires an alertdialog confirmation, and submits one
  desired-state PUT without an optimistic update or reconciliation GET.
- A narrow `IdentitySession.invalidateForAccountStatusChange` seam can act only on the verified
  session subject. A confirmed self-target non-active response or commit-unknown write clears bearer,
  refresh lifecycle, profile, and authority with the existing epoch fence. No logout compensation or
  second session owner exists.
- The production route and navigation are real, session-protected surfaces. No KnownSubjectProvider,
  account picker, directory search, mock preview, provider SPI, profile-kind authorization, or real
  failure fallback exists.

## Security, tenant, and Edge review

- `userId` is only an encoded resource path coordinate. It is not written to `X-Tenant-ID`, request
  headers, profile authority, route/query state, persistence, logs, telemetry, or Preview selectors.
- Browser code does not author bearer or tenant headers. Nginx sends both account operations only to
  Primary, strips forged tenant headers, retains `proxy_next_upstream off`, and does not inject the
  deployment tenant outside exact login/refresh.
- RSS remains authoritative for permission checks, account existence, transition legality, CAS,
  epoch/grant revocation, security-event emission, and the four lifecycle values.

## Verification

- Frozen install, workspace typecheck, lint, format check, 646 unit/root tests, 597 coverage tests,
  49 boundary tests, production build, built-identity scan, and diff check passed.
- Fifteen default Chromium journeys passed. They prove no initial Account Status request, explicit GET,
  confirmed single PUT, closed navigation, and no browser tenant header.
- Docker/Nginx Edge smoke passed with exact GET/PUT method, path, body hash, bearer pass-through,
  tenant stripping, Primary routing, outage isolation, and complete teardown.
- The opt-in runner archived clean Web implementation commit
  `8b7e531d74afcd4f3c440513566ced834b9f4709` and the pinned RSS revision. Main, request-budget,
  Admin-down, and Primary-down phases passed; cleanup passed. The real main phase covered explicit
  active read, same-state `changed:false`, transition to suspended, illegal transition 409, missing
  account 404, limited-user 403, and self suspension followed by local redirect and rejected login.
- A pre-final implementation run at `30abbfe` reported the pre-existing two-session password journey
  as `product:main` and completed cleanup. The final implementation added only credential-safe
  response/location diagnostics to that helper and then passed all phases; the failed receipt remains
  under `/tmp` during review rather than being relabelled as an environment success.

## Four-principle check

- Thorough: both contracts, alternative 409 policy, strict DTOs, explicit coordinate UX, confirmation,
  self-target authority loss, Edge behavior, browser states, and real RSS transitions close together.
- Breaking: there is one explicit real path and no provider/picker/mock/alias, optimistic fact, dual
  authority model, compatibility fallback, or logout compensation.
- Simple: the change reuses `@rss/api`, `@rss/identity`, the single session transport/controller,
  existing authorization UX hints, router metadata, modal, error projection, and Identity Edge route.
- AI-HARD: exact-record validation, closed enums, strict decoders, endpoint policy alternatives,
  generation/abort fences, self-subject comparison, boundary scans, request counts, archived-source
  receipt, real transition evidence, and checked teardown enforce the design.

## Changed-line classification

- Semantic handwritten code and locale content: 812 additions / 14 deletions.
- Unit/type/boundary/browser/Edge/real tests and harness diagnostics: 831 additions / 11 deletions.
- Documentation and governance: 27 additions / 2 deletions.
- Generated and lockfile: 0 lines.
- Implementation total: 1,670 additions / 27 deletions.

## Rollback

Revert this PR as one unit. That removes both endpoint coordinates, DTOs/decoders, the session
invalidation seam, operation/context/view, navigation, Edge/browser/real proof, and consumption note
together while preserving the previously merged Identity self-service and session controller. Do not
retain the page with a direct adapter, restore a KnownSubjectProvider, or add a compatibility alias.
After rollback, rerun API/Identity/Web type checks, boundary tests, Chromium, Edge smoke, and the
bounded real RSS journey.
