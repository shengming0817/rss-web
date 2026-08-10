# WEB-PR-013 real RSS browser journey receipt

## Source and execution boundary

- RSS source: read-only local checkout, pinned commit
  `b7f3e1d0bcc5b2e59639a81b4f37937914b53f00`.
- Web source before this PR: `25693fb6e059bbbfd1f814fd793e42f26db4014b`.
- Tested implementation commit: `a1ca15b5a813db20530355b806830c96bfb3e849`.
- The runner rejects a dirty Web tree and builds the Edge from an archived Web HEAD, so receipt
  `webRevision` names the actual build input rather than a mutable Docker context.
- The runner resolves the exact commit and uses `/usr/bin/git archive` into a temporary directory. It
  never checks out, pulls, builds in, seeds, or cleans the user's RSS working tree.
- The RSS production runtime assembly runs with real PostgreSQL, Redis, RabbitMQ, Vault, and MinIO
  providers. Fixture credentials, roles, one narrow ABAC grant, and account states live only in the
  disposable PostgreSQL volume.
- The browser uses only the built RSS Web Nginx Edge. It sends no tenant header and installs no
  Playwright route interception. The Edge injects the deployment-fixed tenant only on login/refresh.

## Observed journey

The local acceptance run on 2026-08-10 UTC passed all four bounded phases:

1. `main`: real login 201, verified profile 200, Runtime Inventory 200, ambient-tenant Audit first
   page 200, access expiry, one real refresh 201, retried Audit read, and logout with immediate local
   authority removal.
2. `budget-exhausted`: the real RSS server ran with a 1 ms request budget, login exceeded that
   budget and produced the shared contract-safe 503; Web stayed anonymous with no fallback. This
   is request-budget evidence, not a claim about provider-outage mapping.
3. `admin-down`: an Edge with only the Admin upstream coordinate unavailable kept Primary login,
   verified identity, SPA, and shell available while both Admin panels degraded independently.
4. `primary-down`: an Edge with only Primary unavailable kept the SPA and real Admin listener alive;
   the Nginx gateway body failed closed to the safe invalid-response UX.

The main phase additionally observed a real unauthenticated 401, a real server-authoritative 403 for
the limited account, and a real Redis-backed 429 through browser `fetch` to the Edge. Existing isolated
Playwright gateway fixtures remain the malformed/non-JSON evidence; they are not represented as a
real RSS response and never participate in the authoritative journey.

Machine receipt:

```json
{
  "schemaVersion": 1,
  "status": "passed",
  "rssRevision": "b7f3e1d0bcc5b2e59639a81b4f37937914b53f00",
  "webRevision": "a1ca15b5a813db20530355b806830c96bfb3e849",
  "tenantBootstrap": "edge-deployment-fixed",
  "backend": "real-rss-archive",
  "phases": [
    { "name": "main", "status": "passed" },
    { "name": "budget-exhausted", "status": "passed" },
    { "name": "admin-down", "status": "passed" },
    { "name": "primary-down", "status": "passed" }
  ],
  "cleanup": { "status": "passed", "project": "rss-web-real-<pid>" }
}
```

## Safety and semantics

- `audit latest` was corrected to the first server-ordered page: the active contract begins at
  `seq=0` and has no latest/tail coordinate. The explicit refresh repeats that same reviewed read.
- Shared HTTP 429 is now accepted only at the exact RSS coordinate
  `ERR_CORE_TOO_MANY_REQUESTS / too many requests / retryable=true / empty details`; drift becomes a
  protocol error. The Web still performs no automatic retry.
- The real full-access fixture uses a principal-specific policy because RSS intentionally restricts
  ordinary role-only Audit access by principal kind. The limited fixture receives only the Profile
  permissions and proves the 403 boundary.
- No tokens, passwords, tenant headers, response bodies, server messages, or PII enter the receipt.
  JavaScript secrets remain memory-only and test credentials are synthetic, fixed fixture values.
- Normal completion and handled SIGINT/SIGTERM terminate the active asynchronous child, then run
  Compose `down --volumes --remove-orphans` and remove both snapshots before writing the receipt.
  Setup/product work has a 30-minute total deadline; teardown has an independent 120-second budget
  so expiry cannot suppress cleanup. A cleanup failure changes the receipt and exit status and preserves the
  project/recovery path; SIGKILL cannot carry a cleanup guarantee. Preflight, browser/toolchain,
  readiness, timeout, seed, and cleanup failures are recorded as `environment:*`, while assertion
  failures with a journey-spec source location are `product:*`.

## Four-principle check

- Thorough: the real path covers tenant bootstrap, Identity, both listeners, Runtime, Audit, refresh,
  logout, 401/403/429/503, listener isolation, cleanup, and isolated malformed evidence.
- Breaking: there is one RSS source revision, one same-origin Edge, one session path, no alternate
  backend, fallback, old endpoint, or “latest” compatibility claim.
- Simple: the harness composes existing RSS and Web production images with a single override and one
  browser suite; it introduces no runtime registry, mock provider SPI, or application-side gateway.
- AI-HARD: pinned RSS and Web archives, clean-tree rejection, exact shared 429/503 policies,
  no-interception/header guards, phase readiness, bounded subprocesses, safe receipt lifecycle,
  generated disposable fixture, and checked teardown make the boundary executable.

## Reproduction and rollback

```bash
RSS_SOURCE_DIR=/absolute/path/to/rss \
RSS_WEB_REAL_RECEIPT=/absolute/path/real-rss-receipt.json \
pnpm test:e2e:real
```

Revert this PR as one unit to remove the harness, explicit Audit refresh, and shared 429 coordinate.
Do not preserve only the broader 429 acceptance without its exact fail-closed tests, and do not
replace the real source with a mock fallback.
