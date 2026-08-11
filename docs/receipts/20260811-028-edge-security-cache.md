# WEB-PR-028 — Edge security headers and cache receipt

## Scope and provenance

- Issue: #36; blocked-by #35 is closed.
- Implementation commit: `2e5b2585195dcd685a2b26e449b150e6d05c584f`.
- Base Web revision: `f84bdb0aec9d325ba2c04ee5152f3dc145bcd54c`.
- RSS was not modified. The optional archived journey retained the reviewed RSS pin
  `b7f3e1d0bcc5b2e59639a81b4f37937914b53f00`.

## Delivered boundary

- The existing Nginx Edge now emits one enforced self-only CSP plus
  `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, and
  `X-Frame-Options: DENY`. It hides conflicting upstream security headers before
  applying the reviewed browser policy.
- The application has no inline script, runtime inline style owner, external font
  origin, `unsafe-inline`, or `unsafe-eval`. The first-paint theme barrier remains a
  parser-blocking same-origin classic script.
- `index.html`, the theme initializer, and every SPA fallback are
  `no-store, max-age=0, must-revalidate`. Only generated JavaScript and CSS names
  carrying a Vite content hash receive the single
  `public, max-age=31536000, immutable` response. Missing/unhashed assets do not.
- Secret Material retains non-buffered, Edge-owned no-store responses on success
  and failure, including encoded-separator keys. The existing listener routing,
  tenant injection, Internal/Health/metrics denial, and upstream outage isolation
  are unchanged.
- The runtime image removes the stock Nginx `50x.html` and contains only the built
  shell, theme initializer, hashed assets, reviewed Nginx configuration/snippets,
  validator, and base entrypoint mechanism. Node, pnpm, workspace source, source
  maps, and Preview fixtures are absent.
- Role Bindings Preview enablement is physically separated from its fixture and is
  compile-time closed in production. Production artifact scanning now covers Role,
  Config Catalog, and Config History Preview; the explicit demo build retains all
  three as non-authoritative experiences.
- The image listens only on HTTP port 80. It does not emit HSTS or infer TLS from
  forwarded browser input; the verified outer TLS terminator owns certificates,
  redirects, and HSTS.

## Four-principle result

- **Thorough:** structural, browser, production/demo artifact, real Nginx, hostile
  upstream, cache/status, negative-route, and container-content checks cover every
  changed boundary.
- **Breaking:** external fonts, dead Ant theme integration, broad/double asset cache,
  stock content, and production Preview leakage were physically removed without a
  compatibility path.
- **Simple:** Nginx remains the only delivery owner, with one security-header snippet
  and the existing template/proxy/image pipeline.
- **AI-HARD:** exact header counts, closed CSP tokens, generated-asset discovery,
  production/demo marker scans, route-count negatives, and runtime absence checks
  fail closed.

## Verification

Final local implementation verification:

- frozen install and workspace typecheck: passed
- lint and format check: passed
- coverage: 99 files / 978 tests passed
- root boundary: 10 files / 72 tests passed
- production build with all Preview flags forced true, identity scan, and Preview
  absence scan: passed
- explicit demo build with all three Preview experiences and common security/artifact
  scan: passed
- Chromium smoke: 20 passed; stored dark theme is applied before app mount, no
  third-party font request or CSP violation occurs, and route/command focus remains
  intact
- Docker/Nginx Edge smoke: passed, including HTML/deep-link/theme/asset/API/error
  headers, single cache values, hostile upstream stripping, Secret Material all-status
  no-store, #6 negative routes, minimal runtime contents, and checked teardown
- `git diff --check`: passed

The opt-in archived real journey was attempted twice on the exact implementation
commit above. Both attempts stopped in the pre-existing `@main` limited-account
scenario before any Issue #36-specific phase, at different assertions (the expected
403 count, then login/profile setup); both performed checked cleanup. They are not
reported as passing evidence and remain at
`/tmp/rss-web-36-final-real-receipt.json` and
`/tmp/rss-web-36-final-real-receipt-2.json`. This optional harness result did not
replace or weaken the required browser and real-Edge verification above.

## Changed lines and rollback

- semantic/config: +66 / -143
- tests and executable evidence: +415 / -291
- documentation: +39 / -1
- mechanical lockfile dependency removal: +0 / -210
- implementation total: +520 / -645
- generated files: 0

Rollback is one revert of this PR. It removes the security-header/cache policy,
minimal-image and artifact gates, and CSP-compatible theme boundary together while
preserving the #6 listener/tenant routes and #35 Secret Material behavior. HSTS must
not be added as a partial rollback or follow-up inside this HTTP-only image.
