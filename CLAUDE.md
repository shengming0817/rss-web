# RSS Web collaboration

Read `AGENTS.md`, `README.md`, and the active GitHub issue before changing this
repository. The imported source tree is provenance, not product truth.

Do not restore deleted product surfaces, introduce compatibility aliases, or
add a dual-backend mode. Keep cross-package imports on declared package exports,
strict TypeScript, i18n, and accessible UI. `@rss/api` is the sole HTTP boundary:
do not bypass it with direct Axios use, add authentication or tenant behavior,
or copy/generate contract types without an issue establishing the RSS contract.
`@rss/identity` owns the single memory-only session controller. Only its
authenticated profile path may mint branded verified authority. Do not expose
credentials through state, parse JWT claims, add persistence, author tenant
headers, create a second refresh/retry path, or add UI behavior there.
`@rss/api/session` is restricted to this controller; applications must consume
the injected Identity session rather than importing the low-level capability.
The Web bootstrap is the only composition root. Keep Identity Vue components in
`apps/web`, do not add a Pinia session mirror, and never enter the shell before
the branded verified profile is available. Reload intentionally returns to
`/login` because credentials are memory-only.
Password change is a non-idempotent operation owned only by the same Identity session controller. It
uses the no-replay policy, never calls logout-all as compensation, and clears local authority after
confirmed success or a commit-unknown result. Password values remain component-local and must not be
persisted, logged, copied into routes, or exposed through errors.
Account Status accepts only an explicit canonical non-nil `userId` resource path and a closed desired
state. Do not add subject/directory providers, pickers, mocks, tenant/principal inference, optimistic
facts, or fallback sources. The idempotent PUT may use only the session owner's exact 401
single-recovery/replay; never automatically retry network, timeout, conflict, server, or protocol
outcomes. A self-target non-active confirmed or commit-unknown write must clear authority through the
single Identity session controller; do not call logout as compensation.
Roles accepts only explicit roleId and opaque subject coordinates. Do not add a subject directory,
provider, picker, resolver, binding history/read model, permission evaluator, tenant inference, or
fallback source. Non-idempotent assign must use `required-no-replay`; idempotent revoke and list may
use only the session owner's exact 401 recovery. Permissions remain opaque display facts, and boolean
receipts never authorize or construct current bindings.
Policies list/detail and create/update/deactivate use the protected session transport. Keep the current
family/predicate/typed-operand shape strict and fail closed; do not add old operator aliases, browser
ABAC evaluation, effective-permission inference, profile-kind gates, schema copies, runtime registries,
mock fallbacks, or a second policy source. Cursor loading is explicit and detail is fetched only after
the user selects a decoded policy coordinate. CAS versions come only from that decoded detail snapshot;
conflict or unknown outcome requires explicit reconciliation and must never auto-overwrite or resubmit.
Issue #27 adds one app-local, static Role Bindings Preview only. It is registered only when a closed
development/test/demo mode and the exact build-time flag explicitly enable it; production remains
disabled. Every row is synthetic `MOCK_SOURCE` data and permanently non-authoritative. The Preview
has no provider SPI, adapter, transport, command, receipt/history inference, authorization hint,
tenant/principal input, or real-failure fallback.
The pinned RSS login mints only `user` access tokens and the role routes admit only `admin`; preserve
the real-browser 403 evidence until a reviewed RSS baseline exposes consumable Admin authority. Never
mint, infer, or inject an Admin bearer in Web production or acceptance code to force a success path.
The Nginx same-origin Edge is the sole listener-routing and pre-auth tenant
bootstrap boundary. Do not add browser-selectable tenants, client runtime API
origins, listener discovery, proxy fallbacks, or Internal/Health routes.
It also owns the single browser security-header and static-cache policy: enforced
self-only CSP, no framing, no third-party fonts or runtime inline styles, no-store
SPA shell/theme initializer, and immutable build-hashed assets only. Production
artifacts must not contain Preview fixtures, the Nginx stock error page, source
maps, or build tooling. This HTTP-only image must not emit HSTS; the verified
outer TLS terminator owns HTTPS redirect, certificates, and HSTS.

`@rss/authorization` is a closed UX-hint capability, not a PDP. Production code uses its server
mode, which always defers authority to the real request. Do not add policies, ABAC evaluation,
tenant/principal inputs, caches, wildcard matching, or external provider implementations. The
Preview subpath remains forbidden in production Web source unless a later issue names one explicit
composition owner; Preview results are permanently non-authoritative and never short-circuit a
request. The Web authorization context is the only UI coordination owner: it may invalidate an
exact hint only after `wire / 403 / ERR_CORE_FORBIDDEN`, must rethrow the same server error, and must
clear UX outcomes when verified session authority changes. Do not add a second 401 handler or infer
authorization from route, button, profile kind, JWT, tenant, or a local receipt.

Production shell navigation is derived only from implemented route metadata. Do not add placeholder,
draft, unavailable, or future capability routes/menu items. `@rss/shared` owns the closed SourceMeta
union and its sealed constants; source labels describe display provenance only and never grant request,
tenant, principal, or business authority. New RSS source-label owners require an explicit boundary-test
update. Mock/manual/external/unavailable sources remain non-authoritative, and real failures never
fall back to them. Safe error presentation may expose only the reviewed kind, code, retryability, and
requestId; backend messages/details and transport behavior stay outside reusable UI components.

The shared degraded presentation is a pure composition of the existing Unavailable source badge and
safe ErrorPage. Every caller must explicitly select either no recovery or one user-triggered
idempotent-read retry; server retryability never authorizes a write, audited target read, unknown
outcome, or Secret Material replay. Domain operations continue to own loading, abort, generation,
reconciliation, and focus. Do not add a diagnostics store, raw-error history, global retry budget, or
second session/authorization handler.

The authenticated About route consumes one frozen build-time release metadata object from the Web
bootstrap. It may show only the strict Web build revision, the reviewed RSS contract-baseline identity,
and Preview experiences already enabled by the production-gated composition flags. Build/baseline
facts are External; enabled Preview facts are Mock and non-authoritative. About must not fetch, inspect
Runtime Inventory, discover providers/listeners/contracts, read env flags again, or treat release facts
as request, tenant, principal, compatibility, or health authority. The Web image revision, reviewed RSS
contract baseline, and opt-in real-harness RSS archive revision remain separate identities.

`docs/contracts/20260812-rss-release-baseline.json` is the sole release-consumed contract decision
ledger. It is production-excluded and must exactly match the typed endpoint owner set plus the reviewed
RSS source-file closure. Historical comparison, reviewed selected-contract, and real-journey-supported
RSS revisions are distinct identities: hash equality never promotes a revision into the supported
runtime set. Unknown, incompatible, or fail-closed decisions block the release audit. Do not import the
ledger into application code, discover RSS contracts at runtime, create a compatibility fallback, or
claim whole-revision/N-1 compatibility from the bounded journey. Rollback is an atomic immutable
Web/Edge image redeploy by digest, never a partial static-file copy or dual route.

`@rss/runtime` and `@rss/audit` are framework-neutral Admin-listener adapters over the one protected
session transport. Vue composition belongs in `apps/web`. Runtime inventory is facts only; do not use
it for listener discovery or deployment authority. Validate but discard listener/placement endpoints
and SPIFFE identities at the Runtime adapter boundary; the public DTO and UI must not expose or copy
them. Audit is server ordered and its entry hash is opaque. Ambient pagination is an idempotent read;
target-tenant pagination is an explicitly submitted, non-idempotent audited operation and must use the
no-replay session policy. Never prefetch or automatically retry it, infer SuperAdmin capability from
profile kind, send tenant headers, claim a page is latest, bulk-export PII, or fall back from a real
failure to another source. Domain adapters
must attach their reviewed error-coordinate policy; undeclared statuses or drifted WireError fields
fail closed as protocol errors. Idempotent panel retry is user-triggered only.

`@rss/settings` is the framework-neutral owner for the selected Config DTOs and adapter; all Vue
composition stays in `apps/web`. Config publish and rollback are protected no-replay. Any uncertain
result must require an explicit GET before the user decides what to do next; publish also releases the
value draft. Rollback uses only an explicit Manual key/source-version coordinate and must not infer
real history.
Config get/delete may use only the session owner's exact-401 recovery, and delete never parses a 204
body. Config values must not enter URLs, storage, logs, telemetry, errors, receipts, or SourceMeta.
Do not add catalog/history/recent-key providers, mock fallback, tenant inputs, schema loading, or a
second HTTP/session seam.
Issue #34 adds reference-only Secret publish through the existing `@rss/settings` client and a
separate Web route. It is non-idempotent and must use `required-no-replay`; key, storeId, refKey, and
refVersion are internal coordinates that must be released before the request is awaited and must not
enter URL/query/history, storage, logs, telemetry, errors, receipts, or public operation state. A
network, timeout, abort, protocol, malformed-success, or internal outcome is terminal unknown: do not
retry, reset, call secret-resolve, fetch material, or manufacture a reconciliation source. Success may
show only the strictly decoded server key/version receipt. Do not add store/catalog discovery,
tenant inputs, or a second Settings client. The publish route itself never resolves or displays
material; Issue #35 owns the only separate reveal route.
Issue #35 adds a high-risk, one-time Secret Material Reveal through the same `@rss/settings` client.
It accepts only strict canonical Base64 and never decodes UTF-8. Material may exist only in the
route-scoped operation's private lexical reference and active DOM for one 30-second lease. It must not
enter public state, Vue reactive data, URLs, storage, logs, telemetry, errors, receipts, SourceMeta, or
Preview. Confirm clears the Manual key before the request; timeout, hide, Escape, hidden/pagehide,
route leave, session navigation, and unmount all release app-owned references through one fenced
clear path. Copy is explicit and the UI must state that JavaScript memory and the OS clipboard cannot
be physically erased by the app. The exact API request and Edge response are no-store; do not add
prefetch, fallback, automatic non-401 retry, material download/export, publish-to-resolve handoff,
store discovery, tenant inputs, or a second Settings client.
Issue #32 adds one concrete Config Catalog Preview under `@rss/settings/preview`. It is registered only
for an exact development/test/demo build-time flag and production remains disabled. Fixtures are
synthetic Mock metadata only; there is no provider SPI, remote adapter, catalog contract, value/version,
authority inference, automatic request, persistence, URL handoff, or real-failure fallback. A reviewed
key may cross once into the existing Manual draft only after explicit warning confirmation.
Issue #33 adds one independently gated Config History Preview to the same concrete Preview subpath.
Its frozen rows contain synthetic key/version/source metadata only and never claim existence,
currency, recency, or authority. Do not add value, diff, material, actor/time facts, provider/SPI,
transport, contract discovery, or fallback. A fixture row may cross once into the Manual rollback
draft only after explicit warning confirmation; it must not start a GET or rollback. The existing
prepare-and-confirm flow remains the only owner of a real rollback request.

The opt-in real RSS harness may read a user-supplied RSS checkout only through a pinned `git archive`
and must build the Web Edge from an archived, clean Web HEAD rather than the live worktree. It may
mutate only its own temporary snapshot, Compose project, disposable volumes, and fixture rows. It
must keep browser traffic behind the production Edge, fence phase readiness, classify environment
failures separately, avoid logging fixture credentials or response bodies, and treat cleanup failure
as a failed receipt. SIGINT/SIGTERM are handled; SIGKILL cannot carry a cleanup guarantee.
Its bounded browser evidence keeps production and explicitly enabled Preview artifacts distinct. The
ten production phases continue to use the archived production Web image; the final Preview-isolation
phase builds the demo artifact from that same archived clean Web revision and mounts it into the same
production Nginx Edge in front of the same real RSS archive. Preview fixtures must remain Mock,
non-authoritative, and request-free until a user explicitly crosses into an existing Manual flow;
the resulting real RSS response is final and must never fall back to the fixture. Synthetic browser
failure evidence is labelled synthetic and must not be reported as real-backend coverage. Do not add
a fault proxy, interception to the real journey, a second runner/classifier, or a domain-by-status
matrix. Failure postures such as rate limiting must be isolated to their named phase so shared harness
state cannot contaminate unrelated product evidence.

## #2337 independent central Identity app

The earlier bearer session, profile-verification, pre-auth tenant-header, and `apps/web` composition rules govern the existing RSS application. The separate `apps/identity` application follows the accepted boundary in AGENTS.md and `docs/architecture/20260909-2337-central-identity.md`: one cookie session controller, same-origin Identity APIs, strict closed response decoding and no replay. Its browser does not consume internal identity validation, exchange OIDC tokens or inherit old RSS business adapters. Shared API HTTP execution remains single-owned; no legacy wire fallback is permitted. Its static build and browser tests must be included in CI.
