# RSS Web

RSS Web is the browser client for RSS. It is being migrated through small,
independent pull requests from a verified historical source snapshot.

The current retained foundation provides the application shell, theme, i18n,
accessibility, request handling, login/session recovery, local identity and
policy administration, audit, configuration, and health overview. Devboard,
cell scanning, coverage/groups, hosted observability, feature flags, first-run
provisioning, old generation tools, and placeholder product routes are outside
this repository and have been physically removed.

The remaining `@gocell/*` names and UI branding are temporary and are renamed in
issue #3. `packages/contracts` contains a minimal frozen type bridge needed by
the retained code; issue #4 replaces it with selected RSS contracts. Neither is
a compatibility promise, and the project has no dual GoCell/RSS mode.

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
