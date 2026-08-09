# RSS Web collaboration

Read `AGENTS.md`, `README.md`, and the active GitHub issue before changing this
repository. The imported source tree is provenance, not product truth.

Do not restore deleted product surfaces, introduce compatibility aliases, or
add a dual-backend mode. Keep cross-package imports on declared package exports,
strict TypeScript, i18n, and accessible UI. `@rss/api` is the sole HTTP boundary:
do not bypass it with direct Axios use, add authentication or tenant behavior,
or copy/generate contract types without an issue establishing the RSS contract.
