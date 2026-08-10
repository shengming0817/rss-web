# @rss/runtime

Framework-neutral handwritten DTOs, strict decoding, and the injected client for the selected
`runtime.inventory` contract. It uses `@rss/api`; it does not copy or load RSS schemas, discover
listeners, or expose a second transport.

The decoder validates the complete reviewed wire shape and then returns a facts-only projection.
Listener and placement endpoints plus SPIFFE identities are deliberately discarded at that boundary;
they cannot be represented by the public DTO or rendered/copied by Web UI. Unknown schema versions,
enum values, extra fields, and duplicate semantic identities fail closed.
