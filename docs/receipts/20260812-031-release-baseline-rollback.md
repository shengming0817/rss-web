# WEB-PR-031 — Release-consumed baseline and static rollback receipt

## Scope and identities

- Issue: #39; blocker #38 was closed before implementation.
- Final executable implementation commit: `d9600435c13f5b153d4f5e64aaa56661dd10c189`.
- Base Web revision and rollback image source: `a2b90c97d2da7079b0a593fd7b445fd595e6b897`.
- Decision ledger: `20260812-release-consumed-contracts` at
  `docs/contracts/20260812-rss-release-baseline.json`.
- Ledger file SHA-256: `a84b197807a94f47da273c70d4c151f5bb630c665d6b386f7aa880ba264802c2`.
- Historical comparison RSS revision: `b513d3390d73d4f291bb31afc588ca1307ce19af`.
- Reviewed selected-contract RSS revision: `1f6c131f0759f921551a81e12e0adb0071346927`.
- Sole real-journey-supported RSS revision:
  `b7f3e1d0bcc5b2e59639a81b4f37937914b53f00`.

These three RSS identities are intentionally different. The reviewed revision is a static decision
about the selected Web-consumed closure, not the reported version, health, authority, or compatibility
of a running RSS instance. Only the explicit supported revision may enter the archived real harness.

## Consumed-contract decision ledger

- The ledger contains exactly the 25 active typed endpoint owners: Identity 16, Settings 6, Audit 2,
  and Runtime 1. The audit compares method, path, and success status against the imported endpoint
  definitions; missing, extra, duplicate, or drifted coordinates fail closed.
- Its complete immutable source closure contains 80 contract, request, response, declared error, and
  transitive common-schema files. The ordered closure digest is
  `9179ab7ea099032c3441226c818901eebae16a90563d2a665f58c5bfd30922a8`.
- Decisions are closed and explicit: 24 `compatible-exact`, one `compatible-adopted`, zero
  `incompatible`, and zero `fail-closed`. A non-compatible decision blocks the release audit; neither
  `fail-closed` nor byte equality is promoted to compatibility.
- The adopted decision is `runtime.inventory`: the Web already consumes the reviewed `unobserved`
  enum member and exact 500/503 WireError coordinates with strict drift-negative tests.
- `pnpm check:rss-release-baseline` is part of the canonical build. The manifest remains excluded from
  the application bundle; About consumes only its separately reviewed ID and RSS revision scalar.
- About is authenticated and zero-network. It labels ledger/build facts External, keeps Preview facts
  Mock and non-authoritative, and explicitly disclaims runtime instance/version/health/authority,
  whole-API, and N/N-1 claims.

## Real journey decision

The final machine receipt is `/tmp/rss-web-39-final-real-receipt.json`. It records Web
`d9600435c13f5b153d4f5e64aaa56661dd10c189`, RSS
`b7f3e1d0bcc5b2e59639a81b4f37937914b53f00`, all ten production phases passed,
`preview-isolation` passed as `demo-preview`, and checked cleanup passed for Compose project
`rss-web-real-43098`.

Evidence that narrowed the original plan is retained honestly:

- `/tmp/rss-web-39-b7-real-receipt.json` records a transient `environment:compose-up` failure with
  cleanup passed. `/tmp/rss-web-39-b7-real-receipt-2.json` then passed the same bounded phase set.
- `/tmp/rss-web-39-current-real-receipt.json` and `-2.json` both bind RSS `1f6c131…` and Web
  `f34f292…`; each failed environment readiness before a browser phase and each completed cleanup.
  Therefore `1f6c131…` remains the reviewed selected-contract revision but is not in
  `supportedRssRevisions` and cannot be selected by the real runner.

The successful journey is finite evidence for its listed phase, authority, and artifact modes. It is
not whole-revision compatibility, Admin-success certification, a complete status matrix, or an N/N-1
promise. RSS was not modified, and no alternate authority, backend, runtime registry, or fallback was
introduced.

## Static Web/Edge rollback

- `pnpm test:edge` builds the candidate and base images from separate clean Git archives. Both images
  carry their source SHA in the OCI revision label; their immutable image IDs must differ.
- The candidate image is deployed first. The smoke then selects the prior image by its inspected image
  digest, recreates the single Edge container, and verifies that the running container ID and OCI label
  match the rollback image rather than a mutable tag.
- Authenticated About returns to the base Web SHA and its historical baseline identity. Shell/theme
  responses retain no-store and the strict security headers; every rollback hashed asset is immutable;
  candidate-only assets return 404, so no mixed release remains.
- Primary Identity and Admin Runtime requests still reach their distinct listeners after rollback.
  Container/network teardown and removal of temporary archives and local test images are checked.
- The operational procedure is `docs/release/20260812-static-edge-rollback.md`. It permits only atomic
  immutable-image redeployment; partial file copying, dual routing, RSS switching, and a rollback
  control plane are explicitly out of scope.

## Four-principle result

- **Thorough:** exact endpoint coordinates, all declared errors and transitive schema files, negative
  decision fixtures, About/build/OCI identity, bounded real evidence, and real two-image rollback are
  joined without expanding them into blanket compatibility.
- **Breaking:** the new ledger supersedes the old table for release decisions, unsupported RSS
  overrides fail before archive/Docker work, and rollback replaces the whole image rather than keeping
  an alias or mixed static files.
- **Simple:** one committed ledger, one pure audit, one real-revision resolver, and the existing
  About/real/Edge owners carry the feature. There is no runtime registry, compatibility API, second
  runner, or deployment control plane.
- **AI-HARD:** strict manifest fields/enums, typed exact-set comparison, immutable hashes, production
  bundle absence, closed revision selection, machine receipts, digest/OCI/DOM assertions, and checked
  cleanup make unsupported claims fail closed.

## Verification

The single final local acceptance run passed:

- workspace typecheck, lint, and format check
- coverage: 103 files / 995 tests
- root boundary: 11 files / 97 tests
- production build plus release-baseline, Identity, and Preview artifact gates
- ordinary Chromium: 21 journeys
- Docker/Nginx/Chromium Edge and static rollback smoke, including checked teardown
- `git diff --check`

The final supported real archive was then run from the clean executable commit and passed all 11
phases plus cleanup as recorded above.

## Changed lines and rollback

Implementation excluding this receipt:

- release identity, ledger, audit, and operational guards: +876 / -20
- executable tests, Chromium, Edge rollback, and CI evidence: +418 / -22
- project rules and runbook: +74 / -4
- total: +1368 / -46
- generated files and dependency lock changes: 0

Feature rollback is one revert of this PR. It restores the prior About baseline identity and real pin,
removes the ledger/audit and static rollback proof together, and leaves all previously delivered Web
capabilities intact. Deployment rollback is instead the digest-selected image procedure above; do not
approximate either operation with partial files, compatibility aliases, or a second route.
