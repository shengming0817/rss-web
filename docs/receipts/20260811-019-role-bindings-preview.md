# WEB-PR-019 Role Bindings Preview receipt

## Dependency and source boundary

- WEB-PR-018 and WEB-PR-009 were merged before this branch; the implementation base was
  `e326c348d763788e4c22bef3a82a0a0df742bdf3`.
- The final reviewed implementation commit is `80c9ca8`; `baa1352` is the initial feature commit.
- This slice consumes no RSS HTTP contract and does not modify RSS. It does not create a backend issue,
  schema copy, runtime contract reader, provider interface, or future adapter seam.
- All rows are frozen, synthetic Web fixtures. They contain no real tenant, subject, role, permission,
  secret, session, or environment data.

## Delivered boundary

- Role Bindings Preview is enabled only when the application mode is exactly `development`, `test`, or
  `demo` and `VITE_ROLE_BINDINGS_PREVIEW` is exactly `true`. Production mode ignores the flag.
- When disabled, the route and navigation item do not exist; a direct request to
  `/preview/role-bindings` reaches the existing authenticated catch-all instead of a hidden page.
- When enabled, `/preview/role-bindings` renders two read-only projections of the same static fixture:
  by subject and by role. Every row and the route metadata use the sealed Mock source with
  `authoritative=false` and `preview=true`.
- The page has no request, command, confirmation, mutation, receipt, fallback, catalog lookup, binding
  inference, or authority effect. It does not consume the Roles command receipts delivered by
  WEB-PR-018.
- The implementation remains app-local. It does not extend `@rss/authorization/preview`, add a public
  Role Bindings provider, or put Vue code in `@rss/identity`.

## AI-HARD evidence

- The enablement function is a closed mode/flag predicate with positive and negative tests, including
  the production-plus-flag case.
- Router tests prove the route/navigation pair appears together only when enabled and retains Mock
  source metadata. Default browser tests prove production navigation has no Mock source and the direct
  Preview URL remains unavailable.
- The Web composition root has no boolean enablement override: it always derives the Router value from
  the closed mode and exact build-time flag predicate. A boundary test rejects reintroducing that
  bypass, and the composition test proves production plus the true flag still resolves to disabled.
- A root boundary test rejects API/session/authorization imports, HTTP coordinates, mutable controls,
  real-source metadata, and production-default registration in the Preview owner files.
- `SourceBadge` exposes source, authoritative, and preview values as machine-readable attributes, so
  tests do not depend on translated label text to prove provenance.

## Verification

- Frozen install, workspace typecheck, lint, format check, 719 unit/root tests, 666 coverage tests, 53
  boundary tests, production build, built-identity scan, 16 default Chromium journeys, and diff check
  passed in the post-review final validation chain.
- The first Docker/Nginx Edge attempt was blocked by a hung local Docker Desktop credential helper. The
  task-specific build processes were terminated and Compose cleanup was invoked; a direct bounded
  helper probe reproduced the environment failure.
- Edge smoke was then rerun, without code changes, using a temporary anonymous Docker CLI configuration
  against the same local daemon and public image inputs. The production image built, routing/security
  assertions passed, and all containers and the Compose network were removed successfully.
- Final GitHub check status is recorded on the PR after the final tracked HEAD is pushed. This receipt
  does not claim a real RSS journey because the slice has no real transport path.

## Review remediation

- Review found that the initial `WebRuntimeOptions.roleBindingsPreview` test override could express a
  production-enabled Preview even though the production entry point did not use it. The override was
  deleted rather than documented as a convention.
- The composition root now has one mandatory funnel through `isRoleBindingsPreviewEnabled`; its tests
  exercise the actual environment inputs, and the root boundary rejects a future direct boolean bypass.

## Four-principle check

- Thorough: enablement, route registration, navigation, source metadata, read-only rendering, production
  absence, direct-URL behavior, browser behavior, and Edge regression are covered together.
- Breaking: there is one explicit Preview mode and no legacy binding view, provider alias, compatibility
  fallback, dual authority mode, or command-derived read model.
- Simple: a frozen app-local fixture, one predicate, one conditional route, and one read-only Vue page
  reuse the existing router, navigation, i18n, session gate, and SourceBadge.
- AI-HARD: closed mode values, exact flag parsing, sealed Mock metadata, root production scans, router
  structure tests, and default browser assertions enforce the boundary without a reviewer convention.

## Changed-line classification

- Semantic handwritten code and locale/config content: 203 additions / 3 deletions.
- Unit, boundary, and browser tests: 192 additions / 6 deletions.
- Documentation and governance: 11 additions / 0 deletions.
- Generated and lockfile: 0 lines.
- Implementation total excluding this receipt: 406 additions / 9 deletions.

## Rollback

Revert this PR as one unit. That removes the fixture, predicate, conditional route/navigation, Preview
page, source metadata assertions, browser proof, and documentation together while preserving the real
Roles list/assign/revoke slice. Do not keep the route with an API-backed fallback or replace the local
fixture with a provider seam.
