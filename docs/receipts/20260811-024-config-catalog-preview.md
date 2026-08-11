# WEB-PR-024 — Config Catalog Preview receipt

## Scope and provenance

- Issue: #32
- Implementation commit: `34f7b4c7bc4d68d883aa7745f5c9c86db9cb55f8`
- RSS contracts consumed: none. The current RSS baseline has no active Config Catalog/List contract.
- Source: fixed `preview.example.*` metadata in `@rss/settings/preview`, each row sealed as
  `mock`, `authoritative=false`, `preview=true`.

## Delivered boundary

- The route and navigation are absent by default and remain absent in production even if the flag is
  present. Only `development`, `test`, or `demo` plus exact
  `VITE_CONFIG_CATALOG_PREVIEW=true` enables them.
- A production-artifact scan proves the Preview route chunk, fixture keys, and route coordinate are
  physically absent from the built output.
- Search, prefix filtering, and 1-based pages operate only on the local frozen fixture. There is no
  cursor, remote total, provider interface, transport, runtime registry, or fallback.
- Selecting a row opens an explicit warning. Confirmation stages only the reviewed key in a one-shot
  memory handoff and navigates to the existing Settings page. It does not send a request.
- Settings consumes the key as a Manual draft with empty value and rollback version. Only the user's
  later “Read current config” action invokes the real RSS adapter; real errors never recover from Mock.
- Fixtures contain no value, version, tenant, secret, endpoint, receipt, or real environment key.

## Four-principle result

- Thorough: source, fixture shape, local query behavior, enablement, route absence, two-step copy,
  one-shot consumption, zero-request handoff, and explicit real read are machine tested.
- Breaking: one closed Preview only; no compatibility alias, remote source, dual source, or fallback.
- Simple: one concrete package subpath, one flag, one memory handoff, and one conditional Vue route.
- AI-HARD: sealed source metadata, exact flag/mode checks, forbidden-field assertions, dynamic boundary
  tests, API call-count assertions, and production route tests carry the rules.

## Verification

Final implementation commit verification completed locally in a clean worktree:

- frozen install, typecheck, lint, format check: passed
- coverage: 91 files / 868 tests passed
- root boundary: 10 files / 60 tests passed
- Web production build and RSS-only identity scan: passed
- Chromium smoke: 18 passed
- Docker/Nginx Edge routing smoke and checked teardown: passed
- `git diff --check`: passed

The first complete gate stopped at lint because the new root boundary spec was not yet included by the
root TypeScript project. The include was added, then the full gate above was rerun from the beginning.

## Changed lines and rollback

- semantic/config: +380 / -11
- tests/type proofs: +249 / -7
- README/CLAUDE: +11 / -0
- implementation total: +640 / -18
- generated: 0

Rollback is one revert of the PR. It removes the package Preview subpath, flag, conditional route,
one-shot handoff, fixtures, and documentation together while preserving the existing key-driven real
Settings page and adapter.
