# WEB-PR-010 server-authoritative authorization UX receipt

## Dependency and source

- Depends on WEB-PR-008 for the verified memory-only session and WEB-PR-009 / PR #40 for the sealed
  authorization port. Both dependencies were merged before this branch was created.
- RSS remained read-only at revision `b7f3e1d0bcc5b2e59639a81b4f37937914b53f00` during review.
- RSS `ERR_CORE_FORBIDDEN` is the fixed authorization-denial envelope code paired with HTTP 403.
  The Web accepts it only through the existing sanitized `@rss/api` WireError boundary.
- Historical `/api/v1/access/decide`, PDP client, permission map, and action/resource guards were
  physically removed by WEB-PR-002 / PR #15. This PR preserves that deletion with executable
  guards; it does not claim those old deletions as new changed lines.

## Delivered boundary

- `AuthorizationPort.invalidate()` and `reset()` are exact UX-state operations. Server mode keeps
  both as no-ops and always returns `unknown`; Preview invalidation removes only the matching exact
  selector until a verified-session boundary resets it.
- The Web composition root creates one server authorization port and one authorization experience
  beside the existing same-origin transport and Identity session. Production Web source cannot
  import the Preview constructor.
- The Web context executes the real operation exactly once. Only
  `wire + 403 + ERR_CORE_FORBIDDEN` invalidates the related hint, records a safe requestId outcome,
  and rethrows the original error. 401, other 403 codes, conflicts, network, protocol, and unknown
  errors do not mutate authorization hints or create another retry path.
- Optional router metadata and `AuthorizationHintGate` provide narrow future consumption seams.
  Unknown and allow remain operable so RSS can decide; Preview deny is only a UX hint. No fake
  business route, menu, or capability was added in this slice.
- Leaving verified authority or changing verified subject/tenant/kind clears all local denial
  outcomes and Preview invalidations. An authority epoch fence prevents late results from an older
  session from recreating those outcomes.
- Final denials are retained independently per exact intent. A per-intent operation generation
  prevents an older completion from clearing or replacing a newer result, and disposal advances the
  terminal fence before releasing all local UX state. The renderless gate resolves its current
  reactive intent at every read and execution rather than capturing the initial prop.
- The Docker dependency layer now includes every workspace package consumed by the Web app; a root
  guard recursively derives the exact transitive workspace closure from repository manifests so
  future package additions cannot rely on an accidental post-source-copy install and stale manifest
  copies cannot accumulate.

## Security and tenant review

- A local allow cannot suppress or replace a real RSS 403. The same sanitized error object is the
  final result.
- Hints never add headers, select a tenant, parse JWTs, derive permissions from profile kind, retry
  requests, or skip a real operation.
- Session 401 recovery remains solely in `@rss/identity`; tenant bootstrap remains solely in the
  Nginx Edge. No compatibility alias, dual backend, `/access/decide`, browser PDP, or policy model
  was introduced.

## Changed-line classification

- Semantic handwritten: 408 lines.
- Tests and type/boundary guards: 646 lines.
- Documentation, package, deployment, and boundary support: 106 lines.
- Lockfile: 3 mechanical lines for the Web workspace dependency.
- Generated: 0 lines.
- Pure deletion: 2 stale coverage-exclude lines; no legacy product deletion is claimed here.

## Verification

- `pnpm -F @rss/authorization test --run`
- `pnpm -F @rss/authorization typecheck`
- `pnpm -F @rss/web test --run`
- `pnpm -F @rss/web typecheck`
- root boundary checks and legacy access scan
- repository install, typecheck, lint, format, tests, coverage, build, browser, and Edge gates

Final local results: 404 tests passed across 44 files; 363 coverage tests passed across 38 files
with package thresholds satisfied; 41 root boundary tests, production build, five Chromium flows,
and the Docker/Nginx Edge smoke passed. The container registry was slow during a cold dependency
download, but retries completed and no product assertion failed.

The built-in review reported four related Cx2 gaps: multi-intent denial retention, same-intent
completion ordering, reactive intent replacement and terminal disposal, plus one Cx2 Docker
workspace-closure guard gap. They were reproduced with failing tests, fixed as one batch, and
rechecked before merge.

## Rollback

Revert this PR as one unit. Rollback removes the new Web hint-consumption seam and returns the
authorization package to its stateless WEB-PR-009 form. It must not restore the deleted access
package, `/api/v1/access/decide`, permission maps, profile-kind authorization, or a Preview fallback
in production.
