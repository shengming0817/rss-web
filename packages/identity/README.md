# @rss/identity

Handwritten DTOs, strict response decoders, and an injected API adapter for the
selected RSS Identity contracts. Response envelopes remain distinct;
in particular, refresh data is not a complete login session.

The package depends on `@rss/api`, never Axios. Its framework-neutral session
controller keeps bearer credentials in a private memory-only closure. Login
tokens are only candidates: an authenticated profile request must succeed and
pass authority validation before the controller creates an immutable branded
`VerifiedProfile`. Protected requests share one generation-fenced refresh and
retry at most once; failure aborts pending requests and atomically clears the
credential/profile state.

Password change is owned by the same controller and uses the protected no-replay policy. A confirmed
change clears all local authority before resolving; credential drift and commit-unknown results fail
closed rather than retrying a non-idempotent command. Vue code cannot call a second session mutation
path.

Account Status exposes strict GET/PUT adapters for an explicit canonical `userId`. The desired-state
PUT is idempotent, but the Web does not automatically retry uncertain outcomes. The session controller
owns the narrow self-target invalidation seam so a non-active confirmed or commit-unknown result cannot
leave stale bearer authority alive. No subject provider, directory lookup, tenant input, or mock
fallback exists.

Roles exposes one strict cursor list plus assign/revoke command adapters. Role permissions and cursors
are opaque RSS facts; explicit subjects are never resolved through a directory. Non-idempotent assign
uses the protected no-replay policy, while idempotent revoke may use the session owner's one exact 401
recovery. Boolean command receipts describe only that request and never create a binding projection.

Policies exposes strict active list/detail reads and create/update/deactivate writes. The decoder preserves the reviewed equality,
ordering, membership, and string operator families with their typed operands, obligations, and
effective window, while rejecting additional fields and invalid combinations. Update/deactivate CAS
versions come only from decoded detail snapshots; conflicts and unknown outcomes never auto-submit or
overwrite. It does not evaluate ABAC, infer authority, load RSS schemas, or keep a compatibility
representation of retired operators.

The controller never persists or logs credentials, parses JWT claims, authors
tenant headers, or implements UI/Pinia behavior. JavaScript strings cannot be
zeroized; clearing means immediate reference removal, lifecycle abort, and an
epoch fence that prevents late async completion from restoring state.

Contract evidence is recorded in
[`docs/contracts/20260809-current-rss-baseline.md`](../../docs/contracts/20260809-current-rss-baseline.md);
schemas are neither copied nor loaded at runtime.
