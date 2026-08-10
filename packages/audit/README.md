# @rss/audit

Framework-neutral handwritten DTOs, strict decoding, and one injected client for
`audit.list-entries` and `audit.list-tenant-entries`. Ambient reads use normal protected-session
recovery. The explicit target-tenant request uses the protected no-replay policy because every page
is a non-idempotent audited operation; a 401 invalidates the session generation without replaying the
request. The package validates a canonical non-nil target UUID and never accepts tenant or auth
headers. It does not infer SuperAdmin authority, validate opaque entry hashes, copy RSS schemas,
export PII, or create another transport.
