# RSS Web

RSS Web is the browser client for RSS. It is being migrated through small,
independent pull requests from a verified historical source snapshot.

The current repository is intentionally a product-neutral frontend foundation:
application shell, theme, i18n, accessibility, tests, and an unconfigured HTTP
primitive. All historical business routes, backend calls, generated contracts,
administration screens, observability screens, Devboard, and old generation
tools have been physically removed. RSS capabilities return only through later
issues backed by selected RSS contracts.

The repository uses the single `@rss/*` workspace namespace and RSS Web product
identity. Legacy aliases, storage-key fallbacks, and dual-backend modes are not
supported.

Source provenance is immutable under
[`docs/migration/20260809-001-gocell-web-source-baseline.md`](docs/migration/20260809-001-gocell-web-source-baseline.md).

## Verification

Use Node.js 22 and pnpm 11.4.0:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```
