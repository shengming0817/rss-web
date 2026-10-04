# @rss/api

`@rss/api/identity` provides the same-origin Identity HTTP V1 transport and strict authentication errors. `@rss/api/mdm` provides explicit MDM HTTP V1 and documented candidate endpoint boundaries with product error decoding. Both reuse one private HTTP executor; neither retries automatically nor accepts caller-authored Authorization or tenant headers. MDM allows operation-specific Idempotency-Key without generating or replaying it.

Domain clients own DTO decoders. Each application assembles one `@rss/auth` cookie/CSRF controller. Transport errors expose only cause, code and optional status; Axios request/response data never leaves the boundary. Success status is exact, including MDM asynchronous 202. `@rss/api/testing` supplies sanitized failures only to tests.
