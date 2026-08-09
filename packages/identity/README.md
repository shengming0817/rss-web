# @rss/identity

Handwritten DTOs, strict response decoders, and an injected API adapter for the
selected RSS Identity contracts. The five response envelopes remain distinct;
in particular, refresh data is not a complete login session.

The package depends on `@rss/api`, never Axios. It does not store or log tokens,
construct tenant or principal authority, add authentication headers, retry
requests, or implement session/UI behavior. Contract evidence is recorded in
[`docs/contracts/20260809-current-rss-baseline.md`](../../docs/contracts/20260809-current-rss-baseline.md);
schemas are neither copied nor loaded at runtime.
