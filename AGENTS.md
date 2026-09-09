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

# #2337 central Identity application

`apps/identity` is the explicitly accepted central Identity UI, consumed through the rss-identity v1 cookie/CSRF protocol. It is separate from `apps/web`; the existing app's RSS bearer baseline is not a fallback or dependency. Reuse `@rss/core` public UI exports and `@rss/api/identity`. Keep Identity operations/session state app-local; do not add a domain package or mirror store. UI authority hints never replace server checks. Tenant coordinates are explicit route locators or returned by the validated downstream preparation, not authorization.

Only the flow module may persist a bounded, per-tab challenge/flow locator for five minutes; no password, CSRF, token, PKCE verifier or authenticated state is persisted. A flow is removed before accept and never replayed after an unknown result. The sole upstream protocol callback remains `/api/v1/oidc/callback`; UI resume/error routes do not exchange codes. Production hosting remains on the Identity origin and is handed to I08.
