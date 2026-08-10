# WEB-PR-018 Roles management receipt

## Dependency and source

- WEB-PR-017 was merged before this branch; implementation base was
  `29e441c718bd63ca93ccef167513a5477ccee69a`.
- The consumed clean, read-only RSS revision is
  `b7f3e1d0bcc5b2e59639a81b4f37937914b53f00`.
- `identity.roles-list` contract/request/response SHA-256 values are
  `4a4e0d7b4f246b4d90f61948afb6eee164beb11a8b60f09f735e5389936271a7`,
  `7b5f95484acaac845a49868eb53c0b22f97c8361c6f3eb6e1bd3f9d38c03a286`, and
  `c88538246c6522d039744d63a0e72245758c2d2590c8681b2b59698ba254a13b`.
- `identity.roles-assign` contract/request/response SHA-256 values are
  `7bff2f144aa5bd51ba67b7a04446c961f9791e28ac06e566cef48789f21fa79d`,
  `c9414f14248c596ceb2d85cb262d34402c8702be487881aa2053ccddf1ff5b0f`, and
  `e883deeb83574fec973e3c25d839b5138a560cd79cd86fdf89be9fed0df82712`.
- `identity.roles-revoke` contract/request/response SHA-256 values are
  `f091730db197aa51b4672f37f119453577da4317d0fdfed7c6297cbf10db0da9`,
  `90caa4072598f5b8342582c2661a85164e31dce05a2de1b94173b96feb9765af`, and
  `6516eb78cd75e2d3ccd0aa947c2c2e83aa9d72140525b69e767e77026ee84ce3`.
- Hashes are review evidence only; no RSS schema copy, runtime parser, descriptor registry, subject
  directory, provider, mock, fallback, or backend issue was added.

## Delivered boundary

- `@rss/identity` owns three exact DTO/decoder paths and one injected Roles client. Role IDs use the
  contract's bounded ASCII grammar; subjects remain explicit opaque strings, and cursor/permission
  values remain opaque server data.
- List and idempotent revoke use the existing protected session transport. Non-idempotent assign uses
  `required-no-replay`, so an exact 401 invalidates local authority without refresh or replay. No other
  retry, prefetch, optimistic update, or command reconciliation exists.
- The Web catalog has strict cursor/duplicate fences and explicit next-page loading. The command
  operation requires a confirmation dialog, drops the subject after submission, and retains only the
  latest boolean receipt. A receipt never creates a binding list, history, effective-permission model,
  or local authority.
- The production `/roles` route is session-protected and carries exact list/assign/revoke UX intents.
  There is no subject picker, directory lookup, role-binding provider, client-side policy evaluator,
  profile-kind gate, tenant input, or real-failure fallback.
- The page explicitly states that RSS Admin authority is required and that the current User session
  receives the final server 403. This is disclosure, not a client-side authorization inference or
  synthetic elevation path.

## RSS authority finding

- The pinned RSS login/refresh path mints only RSS `user` access tokens. Its Identity contract
  authorizer admits all three role routes only for `admin` before evaluating role permissions.
- A first archived real run at implementation `1a156a38e4e549b1edad54af350f1e5c5299cff0`
  correctly failed as `product:roles` when the journey expected a successful catalog; checked cleanup
  passed. Inspection proved that adding the three permissions to the seeded user role cannot cross the
  principal-kind boundary.
- The implementation did not forge a federated/Admin token, infer Admin from the profile, weaken RSS,
  or add a production bypass. The final real phase instead proves exact server-authoritative 403
  responses for list, assign, and revoke, no browser tenant header, no local command receipt, and no
  inferred binding state. Adapter/component tests cover strict success shapes, while real Edge smoke
  covers exact methods, paths, body encoding, bearer pass-through, and Primary routing.

## Security, tenant, and Edge review

- Subject is PII. The active revoke contract necessarily sends it as an encoded path coordinate, so
  the UI now states that fact rather than promising URL invisibility. It is cleared from the page
  before transport completion and never enters a receipt, persistence, Web telemetry, source
  metadata, or authorization selector. The production Edge access-log format omits the request URI;
  browser network tooling and RSS-owned upstream logging remain outside that narrower guarantee.
- Browser code cannot author bearer or tenant headers. Nginx routes all three operations to Primary,
  strips forged `X-Tenant-ID`, retains `proxy_next_upstream off`, and injects the deployment tenant
  only for exact login/refresh. Its reviewed access-log format records method/status/bytes/request ID
  but never request URI; Docker smoke verifies raw and encoded opaque subjects do not appear in logs.
- RSS remains authoritative for principal kind, permissions, role existence, conflict handling,
  command effects, and the returned boolean. Opaque permissions are display facts only.

## Review remediation

- A single branded `RoleId` parser now owns the 1–128 byte grammar across strict decoders, client
  methods, operation state, and Vue input validation. Unparsed strings cannot enter command methods.
- Repeated endpoint error coordinates were collapsed into internal frozen atoms. Roles behavior tests
  prove reviewed coordinates remain wire errors while undeclared status or field drift fails closed.
- Session integration proves list/revoke perform exactly one refresh and one replay after an exact 401,
  while assign performs one request, zero refreshes, zero replay, and expires local authority.
- Initial catalog loading no longer steals focus. Validation messages are programmatically associated,
  modal cancel restores the opener, and submit retains a focused busy state before moving to the result
  heading. Both actions are disabled while the command is in flight.
- Edge smoke covers reserved characters and Unicode in the opaque revoke subject, checked Compose
  teardown, safe access logging, exact encoded forwarding, and absence of subject material in logs.

## Verification

- Frozen install, workspace typecheck, lint, format check, 705 unit/root tests, 654 coverage tests, 51
  boundary tests, production build, built-identity scan, and diff check passed.
- Sixteen default Chromium journeys passed, including exact successful catalog/assign/revoke mock
  shapes, confirmation, no binding-view inference, and closed navigation.
- Docker/Nginx Edge smoke passed with exact GET/POST/DELETE routing, encoded role/subject coordinates,
  body hash, bearer pass-through, tenant stripping, safe URI-free access logging, Primary/Admin outage
  isolation, and checked complete teardown.
- The opt-in real runner archived clean Web implementation
  `427feebbc961b3c72c329e2d83b8f84d4bb4a07f` and the pinned RSS revision. Main,
  password-change, account-status-self, roles, rate-limited, budget-exhausted, Admin-down, and
  Primary-down phases passed; checked cleanup passed. The Roles phase locks the current User-to-Admin
  authority denial instead of claiming an unavailable success path.
- Two preflight attempts were classified as environment failures with cleanup passed: one transient
  Docker probe and one invocation without the explicit sibling RSS source. The final invocation used
  the reviewed read-only RSS path and passed all eight phases; no failed attempt was reported as a Web
  regression.

## Four-principle check

- Thorough: all three active contracts, status/error policies, strict DTOs, cursor behavior, command
  confirmation, no-replay semantics, safe errors, Edge routes, browser behavior, and current real RSS
  authority close together.
- Breaking: there is one explicit real adapter and no legacy product surface, provider/picker/mock, alias,
  dual authority mode, compatibility fallback, synthetic Admin token, or binding read model.
- Simple: the change reuses `@rss/api`, `@rss/identity`, the single session transport, authorization UX
  context, router metadata, modal/error/source components, and existing Identity Edge prefix.
- AI-HARD: exact-record decoders, closed method/status policies, role grammar, cursor/generation fences,
  no-replay capability, production scans, exact request counts, archived-source receipt, and checked
  teardown enforce the design.

## Changed-line classification

- Semantic handwritten code and locale content: 1,019 additions / 83 deletions.
- Unit/type/boundary/browser/Edge/real tests and harness diagnostics: 958 additions / 6 deletions.
- Documentation and governance: 39 additions / 1 deletion.
- Generated and lockfile: 0 lines.
- Implementation total excluding this receipt: 2,016 additions / 90 deletions.

## Rollback

Revert this PR as one unit. That removes the endpoint coordinates, Roles DTOs/client, pagination and
command operation, context/view/navigation, Edge/browser/real proof, and consumption note together
while preserving the previously merged Account Status and Identity session controller. Do not retain
the page with a direct transport, restore a subject provider, or add a compatibility alias. After
rollback, rerun API/Identity/Web type checks, boundary tests, Chromium, Edge smoke, and the bounded
real RSS journey.
