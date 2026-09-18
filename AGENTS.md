# RSS Web agent boundary

Read `README.md` and the current migration issue before changing this repository.

- Treat the imported source tree as a historical baseline, not as the RSS
  product or contract truth.
- Do not add backward-compatibility aliases, a dual-backend mode, or silent
  fallback between old and new behavior.
- Delete out-of-scope behavior instead of hiding it behind flags.
- Consume RSS only through explicitly selected active contracts; do not create a
  contract bundle, generic SDK/codegen platform, API gateway, IAM/user-directory,
  MDM/fleet, or hosted-observability product.
- Preserve provenance records under `docs/migration/`; later product changes must
  not rewrite the historical source identity.

# #2368 embedded authentication UI

`apps/identity` consumes only rss-identity HTTP v2 under its product host origin. Reuse `@rss/core` and `@rss/api/identity`; its single app-local session controller owns cookie/CSRF transitions and context hints. No platform, downstream, dual backend or bearer fallback. `apps/web` retains its independent contract.

The gateway serves strict static `/api/identity-host/v1/config.json` with canonicalOrigin and oidcEnabled. Missing or malformed input prevents UI startup. Only `/api/identity-host/v1/tenants/{tenant}/context` is a dynamic host endpoint; its hints are session-bound presentation facts. Component transactions enforce management policy. Tenant paths are resource locators.

Only the flow owner may keep a per-tab tenant/kind locator for five minutes. No credentials, authenticated state, tokens or verifier persistence. The sole protocol callback is `/api/v2/oidc/callback`; `/auth/resume` reads the session and never exchanges codes. No write replay after conflict, reauthentication or unknown results. Deployment belongs to #2436; actual browser acceptance belongs to #2366.
