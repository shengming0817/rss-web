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
