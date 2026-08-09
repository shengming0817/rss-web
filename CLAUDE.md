# RSS Web collaboration

Read `AGENTS.md`, `README.md`, and the active GitHub issue before changing this
repository. The imported source tree is provenance, not product truth.

Do not restore deleted product surfaces, introduce compatibility aliases, or
add a dual-backend mode. Keep cross-package imports on declared package exports,
strict TypeScript, i18n, and accessible UI. `@rss/api` is the sole HTTP boundary:
do not bypass it with direct Axios use, add authentication or tenant behavior,
or copy/generate contract types without an issue establishing the RSS contract.
`@rss/identity` maps only its selected contracts; do not turn its DTOs into
verified authority or add session, tenant, retry, storage, or UI behavior there.
