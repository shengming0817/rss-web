# RSS Web

RSS Web is the browser client for RSS. This repository is being rebuilt from a
verified `gocell-web` source snapshot, then reduced and migrated through small,
reviewable pull requests.

The imported tree is a historical engineering baseline, not a compatibility
promise. GoCell product behavior, routes, contracts, package names, and backend
assumptions remain only until the explicitly sequenced cleanup and RSS migration
issues remove or replace them. The project does not support a dual GoCell/RSS
mode.

## Migration sequence

1. Import the verified source snapshot without semantic edits.
2. Delete product surfaces and static fact sources outside RSS scope.
3. Rename the retained workspace and product surface from GoCell to RSS.
4. Replace retained domain capabilities with adapters for active RSS contracts.

Source identity, exclusions, and the verification boundary are recorded in
[`docs/migration/20260809-001-gocell-web-source-baseline.md`](docs/migration/20260809-001-gocell-web-source-baseline.md).

## Baseline verification

Use Node.js 22 and pnpm 11.4.0:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

The imported GoCell workflows and contract-generation paths are transitional.
Passing them proves the imported baseline is internally consistent; it does not
prove compatibility with RSS contracts.
