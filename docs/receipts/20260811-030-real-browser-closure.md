# WEB-PR-030 — Real browser and Preview isolation receipt

## Scope and provenance

- Issue: #38. Its declared blockers #27, #29, and #37 were closed before implementation.
- Final executable implementation commit: `71af81442798b746420b1a90929e285a0edb1bdf`.
- Base Web revision: `a772f31939b864018056d93db3ba908d2d6bd530`.
- Real RSS archive: `b7f3e1d0bcc5b2e59639a81b4f37937914b53f00`.
- Reviewed RSS contract baseline remains `b513d3390d73d4f291bb31afc588ca1307ce19af`.
- RSS was not modified or repinned. The reviewed baseline and the opt-in real archive are
  separate evidence identities, not a compatibility claim.

## Delivered evidence boundary

- The existing real runner remains the only archived-RSS browser runner and the existing lifecycle
  module remains the only Playwright failure classifier. Browser traffic stays behind the production
  Nginx Edge; the real journey contains no request interception or browser-authored tenant header.
- The original ten phases remain production-artifact evidence. A final `preview-isolation` phase
  builds `dist-preview-demo` from the same archived clean Web revision, mounts it read-only into the
  same production Edge, and records `artifactMode: demo-preview` instead of presenting it as a
  production capability.
- The Preview phase visits Role Bindings, Config Catalog, and Config History and proves their visible
  source is Mock, non-authoritative, and preview-only with zero business API calls. The representative
  Catalog handoff creates only an unsubmitted Manual draft; the subsequent explicit Config read
  reaches real RSS exactly once, receives the final 403, becomes Unavailable, and does not restore
  Mock rows.
- Production evidence now asserts RSS source metadata for Runtime and Audit, no Preview navigation or
  About sources, and independent Admin outage. Runtime supplies one representative user-triggered
  retry: one initial request, one focused manual activation, a busy/disabled transition, final heading
  focus, and no Audit retry or fallback. Native Chromium moves focus when a button becomes disabled;
  this receipt does not claim otherwise.
- Settings and Secret evidence scans submitted markers across the DOM, remaining field values, URL,
  history state, local/session storage, and console output after the existing real 403 flows.
- One ordinary Chromium smoke journey uses a deliberately synthetic Secret publish failure to prove
  exactly-once terminal unknown behavior, released coordinates, no material resolve, no retry/reset,
  and no Mock fallback. This is explicitly synthetic evidence and is not counted as a real RSS
  status or backend-fault result. No response-drop proxy, netem layer, fault DSL, second runner, or
  domain-by-status matrix was added.
- Rate limiting is now isolated to the named `rate-limited` phase. Other phases use a bounded relaxed
  posture, preventing shared limiter state from contaminating unrelated login/profile evidence while
  preserving the real 429 journey.

## Four-principle result

- **Thorough:** production, demo-preview, and synthetic evidence are separately labelled; the suite
  joins source metadata, real authority, recovery focus, sensitive-data surfaces, artifact identity,
  lifecycle classification, and checked cleanup.
- **Breaking:** the existing runner and phase owners were extended directly. No compatibility runner,
  duplicate classifier, Preview backend, fallback, or alternative authority seam remains.
- **Simple:** one final phase, one read-only artifact mount, representative rather than Cartesian
  status coverage, and one synthetic browser case close the residual gaps with zero production app
  code.
- **AI-HARD:** the exact phase/mode plan, single runner/classifier, clean archives, no interception,
  request counts, source attributes, artifact mode, leakage surfaces, machine receipt, and cleanup are
  executable fail-closed checks.

## Verification

Final executable verification:

- workspace typecheck, lint, and format check: passed
- coverage suites: 103 files / 995 tests passed
- root boundary: 10 files / 81 tests passed
- production build plus Identity and Preview artifact scans: passed
- ordinary Chromium smoke: 21 passed, including the explicitly synthetic unknown-outcome journey
- Docker/Nginx Edge smoke: passed with checked container/network teardown
- `git diff --check`: passed

The final archived run wrote `/tmp/rss-web-38-final-real-receipt-3.json`. It records Web
`71af81442798b746420b1a90929e285a0edb1bdf`, RSS
`b7f3e1d0bcc5b2e59639a81b4f37937914b53f00`, all ten production phases passed,
`preview-isolation` passed with `artifactMode: demo-preview`, and cleanup passed for Compose project
`rss-web-real-23111`.

Earlier attempts are retained honestly:

- the first invocation failed before Compose because the independent worktree required an explicit
  read-only `RSS_SOURCE_DIR`; it produced only an environment-failure receipt
- `/tmp/rss-web-38-real-receipt.json` and `-2.json` stopped at the previously recorded limited-account
  main scenario; investigation isolated shared rate-limit state and the recovered Profile response
- `/tmp/rss-web-38-real-receipt-3.json` passed the first eight production phases and exposed a brittle
  combined MutationObserver/focus sample in the new Admin retry assertion; the final test separately
  observes lifecycle transitions and settled focus
- review-follow-up runs against `6dff2ec` and `3aade0d` confirmed that a natively disabled Chromium
  button does not retain focus; both stopped at the deliberately over-strong Admin assertion with
  cleanup passed, and the final receipt now states the browser behavior precisely

All failed product attempts report cleanup passed. None is presented as successful evidence.

This receipt certifies only the listed finite paths on the listed archived Web/RSS revisions. It does
not certify GA readiness, T3 coverage, a full domain-by-status matrix, RSS compatibility beyond these
paths, Admin-success behavior unavailable to the pinned browser authority, or rollback/upgrade
closure.

## Changed lines and rollback

- runner and test-only Compose semantics: +113 / -22
- browser, harness, and executable evidence: +330 / -18
- README and project rules: +17 / -0
- implementation total excluding this receipt: +460 / -40
- production application/package code: 0
- generated files and dependency lock changes: 0

Rollback is one revert of this PR. It removes the Preview-isolation phase, artifact-mode receipt fact,
representative browser assertions, rate-limit phase isolation, and synthetic unknown journey together.
It does not remove the existing ten real phases, production Edge, session recovery, Preview features,
or any domain implementation delivered by earlier issues.
