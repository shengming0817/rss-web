# @rss/authorization

`@rss/authorization` provides non-authoritative UX hints. It is not a browser PDP and never
changes request authority.

The production root exports `createServerAuthorizationPort()`. Its hint is always `unknown`, so
the real RSS request remains the only authorization decision. `execute()` invokes the supplied
operation exactly once and preserves its value or error.

The separate `@rss/authorization/preview` entry is for explicitly enabled dev, test, or demo
scenarios. Preview selectors match exact contract, permission, and optional resource coordinates;
they do not accept policies, ABAC attributes, tenant IDs, principals, roles, or wildcards. Every
Preview result is permanently `authoritative: false`. Production Web source is statically blocked
from importing this entry until a later issue establishes one reviewed composition owner.

`invalidate(intent)` removes only an exact Preview hint after an owning UI layer observes a final
server denial; `reset()` clears those UX-only invalidations at a verified-session boundary. Both are
no-ops in server mode. They do not cancel, authorize, retry, or otherwise alter a real request.

RSS ADR-025 and the Common ABAC schema remain backend facts. This package neither copies nor
evaluates that policy model.
