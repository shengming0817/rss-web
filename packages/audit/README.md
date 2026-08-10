# @rss/audit

Framework-neutral handwritten DTOs, strict decoding, and the injected client for the ambient-tenant
`audit.list-entries` contract. It deliberately does not expose the non-idempotent cross-tenant read,
validate opaque entry hashes, copy RSS schemas, or create another transport.
