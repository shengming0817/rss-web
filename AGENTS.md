# RSS Web collaboration

Read README.md and the current issue before changing this repository. Use /usr/bin/git.

- apps/identity and apps/mdm are independent product compositions. @rss/auth owns shared cookie-session and authentication UI factories; each app creates exactly one session owner. Identity uses same-origin HTTP v2 and identity-host endpoints; MDM uses explicit versioned domain clients and documented candidate APIs.
- @rss/api/identity owns HTTP execution and strict error decoding. Domain clients own endpoint DTO decoders. The per-app shared session controller alone owns cookie/CSRF transitions. Never add bearer fallback, old wire decoding, a second session/retry controller, or credential persistence.
- @rss/core owns reusable presentation used by Identity: theme, locale, modal and styles. Keep package imports on declared exports, strict TypeScript, accessible UI and i18n.
- Host config is strict and static; missing or malformed input prevents startup. Context hints are bound to tenant/principal/session and grant no authority. Backend transactions enforce management policy.
- Tenant paths are resource locators. Only the flow owner may store a per-tab tenant/kind locator for five minutes. Never persist secrets, authenticated state or verifier data. /api/v2/oidc/callback is the sole protocol callback; /auth/resume reads the session and never exchanges codes.
- No automatic write replay after conflict, reauthentication or unknown results. Clear component-local secrets on submission.
- Delete retired implementation and its dedicated exports/tests/scripts; no aliases, dual backend, placeholder files or silent fallback. Preserve docs/migration source provenance without rewriting it.
- Validate affected behavior and necessary integration. Retain production bundle checks for legacy authentication, mock code and source maps. Do not add commit/clean-HEAD/archive/digest proof, simulated consumers, receipt frameworks or ordinary capacity tests. Reuse caches.
- Integration must redact secrets, bound child processes, handle interruption and fail when cleanup is unconfirmed. Actual browser/product acceptance remains separately owned.

- MDM demo runs an explicit loopback HTTP scenario server. Production entries never import demo identity/state; real failures never fall back to mock. Features register routes and consume injected clients, not new session/transport owners. Track UI, mock, live integration and product acceptance separately.
