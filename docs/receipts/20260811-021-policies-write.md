# WEB-PR-021 Policies write receipt

## Source and contract boundary

- Implementation is based on merged WEB-PR-020 at `d54a7afe80c160806653cb9a076c6cd75935ed4e`.
- Review used the read-only RSS tree at `27113ade`; the bounded real journey archives the pinned RSS
  revision `b7f3e1d0bcc5b2e59639a81b4f37937914b53f00`.
- Contract TOML SHA-256 values for create, update, and deactivate are respectively
  `66d5105d3a846d525d1cbd742064b98eb6c5adaf078df95d3a855cde4e2c7dfe`,
  `4f1c18ae74a4e963c3d9ad83b47645618d93e22411ce347ad5a12b21b9c56e2e`, and
  `cde7f396da804bfa7fd151cfd43fe2ad7c3c2481de830a5ac3502b952ff16084`.
- Request/response hashes remain the selected baseline values. No RSS schema copy, runtime parser,
  policy evaluator, provider SPI, mock fallback, or backend issue was added.

## Delivered boundary

- `@rss/api` owns exact POST create, PUT update, and POST deactivate coordinates plus reviewed
  validation/not-found/conflict/outbox/internal WireError policies.
- `@rss/identity` owns exact write DTOs, strict response decoders, UTF-8 and typed-operand validation,
  response-coordinate correlation, and the single injected client. All three idempotent contracts use
  the existing protected session transport and its one exact-401 refresh/replay policy.
- The Web editor preserves typed literal/attribute/set/pattern operands, individual set and field-mask
  elements, obligations, and effective windows. It validates structure only and never evaluates ABAC.
- Update and deactivate capture an opaque `PolicyVersion` only from a decoded detail snapshot. Raw
  numeric versions cannot enter the public write API, and the version has no editable field. Every
  write requires confirmation with the target coordinate and emits no optimistic authority or policy
  projection.
- Exact 409 becomes a retained conflict draft. Network, timeout, protocol, internal, and other
  commit-unknown outcomes retain the draft without success or automatic replay. Reconciliation is an
  explicit list/detail re-read. Conflict and unknown states cannot be reset, replaced, or navigated
  away through catalog controls; the stable editor retains its draft until a matching detail read
  succeeds, and never overwrites or resubmits it automatically.
- Success is an action-specific receipt. Deactivate retains its command target long enough to re-read
  that exact policy, while field validation identifies, describes, and focuses the first invalid
  editor control.

## Authority and security

- Create, update, and deactivate have independent authorization UX intents, but every operation still
  reaches the real RSS endpoint for final authorization. The browser never authors bearer or tenant
  headers and never infers Admin from profile kind or policy contents.
- The pinned browser login establishes only User authority. The isolated real `policies-write` phase
  therefore proves final RSS 403 for all three writes rather than fabricating an Admin bearer.
- Nginx Edge smoke proves exact method/path/body bytes, Primary routing, bearer pass-through, forged
  tenant removal, listener isolation, and checked teardown.

## Verification and evidence history

- Frozen install, workspace typecheck, lint, format check, 849 unit/root tests, 793 coverage tests, 56
  boundary tests, production build, built-identity scan, and diff check passed.
- Seventeen default Chromium journeys passed, including a confirmed update success fixture and no
  browser-authored tenant header.
- Docker/Nginx Edge smoke passed the three exact write routes and checked teardown.
- The final real runner archived clean Web implementation
  `2e66078c46ebbead716bf78119c85f3ea7e7598c`. Main, password-change, account-status-self, roles,
  policies-write, rate-limited, budget-exhausted, Admin-down, and Primary-down phases passed; cleanup
  passed. Machine receipt: `/tmp/rss-web-29-final2-real-receipt.json`.
- Review closure added the decoder-owned version brand, action-result discrimination, stable draft
  ownership, exact deactivate refresh, field-level accessibility, shared error rules, decoder-only
  version minting, reconciliation recovery/focus, and a bounded process-group funnel that escalates
  SIGTERM to SIGKILL. The final real run used the resulting clean implementation commit, not the
  pre-review receipt.
- Final regression closure also centralized the non-branding PolicyVersion validity predicate and
  clears obsolete reconciliation notices before every new write command.
- An initial invocation from the nested worktree used the runner's default sibling path and failed as
  `environment:rss-revision`; explicit `RSS_SOURCE_DIR` fixed only source location. The first product
  run exposed a fuzzy accessible-label selector and cleaned up. The next run showed that adding three
  writes to `main` exhausted the shared request budget before logout; moving writes into a separately
  recreated server/Edge phase closed the stateful isolation instead of weakening assertions.

## Four-principle check

- Thorough: exact contracts/errors, strict authoring and decode, CAS, typed editor, conflict/unknown
  outcome, safe authority, browser, Edge, and real RSS evidence close together.
- Breaking: one current adapter and editor, with no legacy vocabulary, compatibility aliases, dual
  authority, optimistic write model, evaluator, or fallback.
- Simple: reuse the existing API funnel, Identity package, session transport, authorization context,
  Policies page, modal, error projection, and Identity Edge prefix.
- AI-HARD: exact-record parsers, closed operator carriers, branded coordinates, snapshot-owned CAS,
  generation/abort fences, no-auto-replay state, boundary scans, archived inputs, and checked teardown
  mechanically enforce the design.

## Changed-line classification

- Semantic handwritten code, locales, and docs: 1,534 additions / 46 deletions.
- Unit/type/boundary/browser/Edge/real tests and harness: 1,294 additions / 59 deletions.
- Generated and lockfile: 0 lines.
- Implementation total excluding this receipt: 2,828 additions / 105 deletions.

## Rollback

Revert this PR as one unit. That removes all three endpoint coordinates, write DTOs/client methods,
editor/CAS operation, write intents, browser/Edge/real proof, and consumption note while preserving the
previous list/detail slice. Do not retain a partial direct transport, editable expectedVersion, local
policy evaluator, or compatibility write path. Then rerun typecheck, boundary tests, Chromium, Edge,
and the bounded real journey.
