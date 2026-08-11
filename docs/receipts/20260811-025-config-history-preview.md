# WEB-PR-025 — Config History Preview receipt

## Scope and provenance

- Issue: #33
- Implementation commit: `12bceeb32e14dc762edadcecb02bfec84d6b35aa`
- RSS contracts consumed: none. The current RSS baseline has no active Config History/List/Versions
  contract.
- Source: frozen synthetic key/version rows in `@rss/settings/preview`, each sealed as `mock`,
  `authoritative=false`, `preview=true`.

## Delivered boundary

- Config History Preview has its own exact `VITE_CONFIG_HISTORY_PREVIEW=true` gate and is registered
  only in `development`, `test`, or `demo`. Production ignores the flag.
- The production artifact scan proves both Config Preview routes, components, fixture markers, and
  chunks are physically absent from the built output.
- Rows contain only a reviewed Catalog fixture key, positive safe-integer version, and sealed Mock
  source. They do not contain or claim value, diff, material, time, actor, hash, current/latest state,
  existence, or authority.
- Catalog and History share one app-local, one-shot discriminated handoff. Compile-time private brands
  reject same-shaped objects; runtime fixture identity checks reject branded spreads or substituted
  coordinates.
- Selecting a History candidate does nothing until the user confirms the Preview warning. Successful
  copy creates only an unsubmitted Manual `key + toVersion` draft in the existing Settings page.
- Copying sends no GET or rollback. The user must separately prepare rollback and confirm the existing
  #31 alertdialog before one real request can be sent. Real 404/409/unknown outcomes retain their
  existing authoritative behavior and never fall back to Mock.
- Catalog and History flags are independent; all four combinations are tested and any enabled Config
  Preview receives the same handoff instance as Settings.
- If session routing redirects, aborts, or rejects before Settings mounts, the staged coordinate is
  discarded and an accessible local error is shown; no draft can cross into a later session.

## Four-principle result

- Thorough: fixture shape, source, coordinate uniqueness, two explicit confirmations, one-shot
  consumption, zero-request copy, real-failure behavior, flag matrix, and artifact absence have
  machine evidence.
- Breaking: one closed Preview source only; no provider, SPI, future adapter, backend issue,
  compatibility layer, runtime discovery, or fallback.
- Simple: one concrete fixture module, one shared memory handoff, one conditional route, and the
  existing rollback state machine.
- AI-HARD: private brands, runtime identity fences, discriminated draft/router options, leakage scans,
  API call counts, and the production build gate carry the rules.

## Verification

Final implementation commit verification completed locally in a clean worktree:

- frozen install, typecheck, lint, format check: passed
- coverage: 94 files / 888 tests passed
- root boundary: 10 files / 60 tests passed
- Web production build with both flags forced true, RSS identity scan, and Config Preview artifact
  scan: passed
- explicitly enabled `demo` Preview build: passed
- Chromium smoke: 18 passed
- Docker/Nginx Edge routing smoke and checked teardown: passed
- `git diff --check`: passed

## Changed lines and rollback

- semantic/config: +421 / -63
- tests/type proofs: +503 / -94
- README/CLAUDE: +20 / -5
- implementation total: +944 / -162
- generated/lockfile: 0

Rollback is one revert of the PR. It removes the History fixture, flag, route, shared Preview draft
extension, and documentation together while preserving the existing real Settings adapter and
explicit rollback workflow.
