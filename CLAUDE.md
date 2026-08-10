# RSS Web collaboration

Read `AGENTS.md`, `README.md`, and the active GitHub issue before changing this
repository. The imported source tree is provenance, not product truth.

Do not restore deleted product surfaces, introduce compatibility aliases, or
add a dual-backend mode. Keep cross-package imports on declared package exports,
strict TypeScript, i18n, and accessible UI. `@rss/api` is the sole HTTP boundary:
do not bypass it with direct Axios use, add authentication or tenant behavior,
or copy/generate contract types without an issue establishing the RSS contract.
`@rss/identity` owns the single memory-only session controller. Only its
authenticated profile path may mint branded verified authority. Do not expose
credentials through state, parse JWT claims, add persistence, author tenant
headers, create a second refresh/retry path, or add UI behavior there.
`@rss/api/session` is restricted to this controller; applications must consume
the injected Identity session rather than importing the low-level capability.
The Web bootstrap is the only composition root. Keep Identity Vue components in
`apps/web`, do not add a Pinia session mirror, and never enter the shell before
the branded verified profile is available. Reload intentionally returns to
`/login` because credentials are memory-only.
The Nginx same-origin Edge is the sole listener-routing and pre-auth tenant
bootstrap boundary. Do not add browser-selectable tenants, client runtime API
origins, listener discovery, proxy fallbacks, or Internal/Health routes.

`@rss/authorization` is a closed UX-hint capability, not a PDP. Production code uses its server
mode, which always defers authority to the real request. Do not add policies, ABAC evaluation,
tenant/principal inputs, caches, wildcard matching, or external provider implementations. The
Preview subpath remains forbidden in production Web source unless a later issue names one explicit
composition owner; Preview results are permanently non-authoritative and never short-circuit a
request. The Web authorization context is the only UI coordination owner: it may invalidate an
exact hint only after `wire / 403 / ERR_CORE_FORBIDDEN`, must rethrow the same server error, and must
clear UX outcomes when verified session authority changes. Do not add a second 401 handler or infer
authorization from route, button, profile kind, JWT, tenant, or a local receipt.

Production shell navigation is derived only from implemented route metadata. Do not add placeholder,
draft, unavailable, or future capability routes/menu items. `@rss/shared` owns the closed SourceMeta
union and its sealed constants; source labels describe display provenance only and never grant request,
tenant, principal, or business authority. New RSS source-label owners require an explicit boundary-test
update. Mock/manual/external/unavailable sources remain non-authoritative, and real failures never
fall back to them. Safe error presentation may expose only the reviewed kind, code, retryability, and
requestId; backend messages/details and transport behavior stay outside reusable UI components.
