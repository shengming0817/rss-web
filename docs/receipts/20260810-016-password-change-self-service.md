# WEB-PR-016 Password change self-service receipt

## Dependency and source

- WEB-PR-015 was merged before this branch; implementation base was
  `b20f02bce038330b0ee1287602c72edac0186e23`.
- The consumed clean, read-only RSS revision is
  `b7f3e1d0bcc5b2e59639a81b4f37937914b53f00`.
- `identity.password-change` contract, request, and response SHA-256 values are
  `6798727427fbdfffa1f226b2734cbe808341d772b4413465d5376c3e3fa7eeb1`,
  `055b9ef6fb6eceed4b2770f42a23bf29d70d2271475c6418cc8337fddce49602`, and
  `6e518a5eb318c0979189babca8ed856c7b39cdf68d004cdbf724893cc8940fe9`.
- Hashes are review evidence only; no schema, parser, registry, or runtime discovery was added.

## Delivered boundary

- `@rss/identity` owns the exact request/response DTO, strict decoder, and one no-replay adapter for
  POST `/api/v1/identity/password/change`. The request cannot express headers or tenant authority.
- The unique memory-only `IdentitySession.changePassword` owner sends the non-idempotent command at
  most once. A confirmed `changed:true` clears secrets, verified profile, refresh state, lifecycle,
  and authority before resolving. It never calls logout or logout-all as compensation.
- Credential drift, `changed:false`, and commit-unknown network/timeout/protocol/500 outcomes fail
  closed to expired. Definite policy/forbidden/rate-limit/pre-handler-unavailable responses remain
  available for a corrected explicit submission and are never automatically retried.
- The authenticated `/identity` route reuses `VerifiedProfilePanel` and `SessionActions`; Home no
  longer duplicates the verified profile owner. Authorization metadata remains a UX hint and every
  password change still reaches the real RSS endpoint exactly once.
- Current, replacement, and confirmation values exist only in local component refs. Submission
  snapshots the two wire fields, immediately clears all inputs, excludes confirmation, and releases
  every reference again on completion or unmount. No password reaches state, routes, logs, telemetry,
  clipboard, source metadata, or error text.

## Security, tenant, and Edge review

- Browser code does not author `Authorization` or `X-Tenant-ID`; the session capability owns bearer
  injection and Nginx strips forged tenant headers. Deployment tenant injection remains limited to
  exact login/refresh routes.
- The existing Identity wildcard sends password change to Primary with `proxy_next_upstream off`.
  Docker smoke proves POST body/Authorization pass-through, tenant removal, and no listener fallback.
- RSS owns Unicode/NFC length policy, compromised-password checks, credential CAS, authn epoch,
  grant/family revocation, and the OutboxFact transaction. Web does not duplicate those rules.
- JavaScript cannot promise physical zeroization; the reviewed guarantee is immediate DOM/reference
  removal plus lifecycle abort and epoch fencing against late authority resurrection.

## Verification

- Frozen install, workspace typecheck, lint, format check, 577 unit/root tests, 530 coverage tests,
  46 boundary tests, production build, and built-identity scan passed.
- Fourteen Chromium journeys passed, including exact single POST, no tenant header, immediate field
  removal, local authority loss, and closed four-route navigation.
- Docker/Nginx Edge smoke passed with password POST routed only to Primary and complete teardown.
- The opt-in runner archived clean Web implementation commit
  `5ce6b8825637bb6f83f9ac57291016d4b51cdbf8` and the pinned RSS revision. Main, request-budget,
  Admin-down, and Primary-down phases passed; cleanup passed. An isolated user held two real browser
  sessions: one password change redirected locally to Login, the other grant became unusable, the old
  password failed, and the replacement password established a newly verified session.

## Four-principle check

- Thorough: contract, strict decoder, no-replay session mutation, commit-unknown handling, secret
  lifecycle, self-service UX, Edge path, browser behavior, and real two-session revocation close as one
  slice.
- Breaking: there is only `changePassword`; no alias, direct Vue adapter, second session/logout path,
  old policy copy, or fallback exists.
- Simple: the change reuses the endpoint owner, existing protected transport, one session controller,
  verified profile, session actions, router guard, and Identity wildcard.
- AI-HARD: exact DTOs, closed session policy, single-flight/call-count tests, epoch/lifecycle fences,
  source scans, DOM/log negatives, real Nginx evidence, and archived RSS evidence enforce the boundary.

## Changed-line classification

- Semantic handwritten code and locale content: 403 additions / 21 deletions.
- Unit/type/boundary/browser/real tests and harness diagnostics: 617 additions / 12 deletions.
- Documentation and governance: 47 additions / 10 deletions.
- Generated and lockfile: 0 lines.
- Implementation total: 1,067 additions / 43 deletions.

## Rollback

Revert this PR as one unit. That removes the endpoint/DTO, session mutation, self-service route/form,
navigation, browser/Edge/real proof, and consumption note together while preserving the previously
merged Login/profile/logout session. Do not retain the password route with a replay-capable caller,
restore a direct adapter path, or add a compatibility alias. Rerun Identity/API/Web type checks,
boundary tests, Chromium, Edge smoke, and the bounded real RSS journey after rollback.
