# @rss/identity

Handwritten DTOs, strict response decoders, and an injected API adapter for the
selected RSS Identity contracts. The five response envelopes remain distinct;
in particular, refresh data is not a complete login session.

The package depends on `@rss/api`, never Axios. Its framework-neutral session
controller keeps bearer credentials in a private memory-only closure. Login
tokens are only candidates: an authenticated profile request must succeed and
pass authority validation before the controller creates an immutable branded
`VerifiedProfile`. Protected requests share one generation-fenced refresh and
retry at most once; failure aborts pending requests and atomically clears the
credential/profile state.

The controller never persists or logs credentials, parses JWT claims, authors
tenant headers, or implements UI/Pinia behavior. JavaScript strings cannot be
zeroized; clearing means immediate reference removal, lifecycle abort, and an
epoch fence that prevents late async completion from restoring state.

Contract evidence is recorded in
[`docs/contracts/20260809-current-rss-baseline.md`](../../docs/contracts/20260809-current-rss-baseline.md);
schemas are neither copied nor loaded at runtime.
