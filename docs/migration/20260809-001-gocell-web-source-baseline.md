# gocell-web source baseline

## Purpose

This document identifies the immutable source used to bootstrap RSS Web. It is
provenance evidence only. It does not make the imported GoCell contracts,
product scope, routes, or backend assumptions part of the RSS Web product.

## Source identity

| Field | Value |
|---|---|
| Archive | `gocell-web-develop.zip` |
| Archive SHA-256 | `ac7d458edb963336ecea2a32e8b583fe8d2bb5e3861dbd3c54d53577ec158f17` |
| Upstream commit | `7e778f2a647693a4a3eb7397862ecb8ccb9c2401` |
| Imported files | 543 |
| Import commit | `401e30d` |

The archive passed its ZIP integrity check. Its 543 regular files were compared
byte-for-byte with the imported tree before the import commit was created. The
executable bit on `.husky/pre-commit` was also verified.

The local `/Users/shengming/Documents/code/gocell-web` checkout was deliberately
not used because it contains local changes and is not the immutable input named
by the issue.

## Import boundary

The archive's `gocell-web-develop/` directory prefix was removed. Repository
content was imported without formatting, renaming, deletion, generated-file
refresh, or other semantic edits.

The following local or derived paths are excluded from the source boundary even
if they appear in a future working directory:

- `.git/`
- `node_modules/`, `.pnpm-store/`
- `worktrees/`, `test-artifacts/`
- `coverage/`, `dist/`, `.vitest/`, `.playwright/`
- `playwright-report/`, `test-results/`
- `.DS_Store`

Version-controlled dotfiles, CI workflows, `.claude/`, `.husky/pre-commit`,
`apps/web/.env.development`, design assets, generated contract files, and
`tools/.gocell-ref` are included because they are present in the verified
upstream commit. Their presence is historical evidence, not an RSS product
commitment.

## Migration boundary

RSS Web is not backward-compatible with GoCell and will not retain a dual
backend, namespace aliases, compatibility flags, or fallback paths. Follow-up
issues delete out-of-scope product surfaces before renaming the retained
workspace and replacing domain behavior with active RSS contract adapters.

In particular, success of the imported codegen and cell-manifest workflows only
proves consistency with the historical source. It must not be reported as RSS
contract compatibility evidence.

## Legacy identity exception

This provenance record and the exact README link to its filename are the only
tracked locations allowed to retain the historical product identity. Production
source, package metadata, tests, deployment configuration, and other governance
documents must use RSS-only naming.

## Verification

The clean baseline is verified with:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

Product assertion failures and environment/toolchain failures are reported
separately. The complete import can be rolled back by reverting the bootstrap
pull request; it does not mutate RSS or any backend data.
