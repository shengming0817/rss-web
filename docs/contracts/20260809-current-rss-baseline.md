# Current RSS HTTP contract baseline

Captured on 2026-08-09 UTC from the clean, read-only RSS checkout at commit
`b513d3390d73d4f291bb31afc588ca1307ce19af`. Every SHA-256 below is over the
raw schema file at that revision. Planning-pack hashes were not used.

This is review evidence for the contracts selected by RSS Web. It is not a
runtime registry, a claim that every adapter already exists, or a copy of the
backend contract tree. Adapters are enabled only by their owning issue.

| Contract ID | Method | Path | Success | Contract source | Request schema SHA-256 | Response schema SHA-256 |
| --- | --- | --- | ---: | --- | --- | --- |
| `audit.list-entries` | GET | `/api/v1/audit/entries` | 200 | `contracts/http/audit/v1/list-entries/contract.toml` | `cec15c822a3b892419c2814c1542ab041abc9601ab7e39e6bb1d5bfb3c602ed0` | `0e24f408fedc33948ec62896fc3fe5e47681b7acdafcad7022ab01f7fc642d01` |
| `audit.list-tenant-entries` | GET | `/api/v1/audit/tenants/{tenantId}/entries` | 200 | `contracts/http/audit/v1/list-tenant-entries/contract.toml` | `36c75a1ecba6ecd027be66f5819bb02785b18007bd20674435a1e4e2705e81c0` | `c3f0b3e61b9574fc822262d4b1052045cae714b4c15570e239537b48d6f358c7` |
| `identity.account-status-get` | GET | `/api/v1/identity/accounts/{userId}/status` | 200 | `contracts/http/identity/v1/account-status-get/contract.toml` | `ea1cad270e9cbacbab52d3a3f50532fe80f108005fdc1e2d8262ed1c780a6688` | `6ca8313a01a539d1081ada55b1bd152632060a3490fa5d0d483726299d11ebf1` |
| `identity.account-status-set` | PUT | `/api/v1/identity/accounts/{userId}/status` | 200 | `contracts/http/identity/v1/account-status-set/contract.toml` | `accda8ebb305f9669b3a92ad578675331e7af14f99088bb570b9d611d72f7147` | `ddb3918bb8c739f61416d66fc8a712f42ef53e63672ab32a20e25d1a29ac3395` |
| `identity.login` | POST | `/api/v1/identity/login` | 201 | `contracts/http/identity/v1/login/contract.toml` | `a31fb0f85ac64cdcb7ea710da564ee077dc83691c010767d59d72958c6bbf9a7` | `27782157748c9357ed5a4832f053fc0caf32be115c65ff661ddeca71c9174e94` |
| `identity.logout-all` | POST | `/api/v1/identity/logout-all` | 200 | `contracts/http/identity/v1/logout-all/contract.toml` | `2b86ce16cfc3eb0d6870a47b728d52d1a1cd34885e4bea9ebfec6080853f0882` | `38ae5a875184bea024b1d73b9a7537d074ac1e29216e373af9e92931393964d8` |
| `identity.logout` | POST | `/api/v1/identity/logout` | 200 | `contracts/http/identity/v1/logout/contract.toml` | `e426b10fa58de94999ff0ee43f88ea19ebef39f3ab871df7389f62f7f1948333` | `874408b4f6e516ced5f92f911a945aaa13a1f0de784770e3aafe384a56aadd01` |
| `identity.password-change` | POST | `/api/v1/identity/password/change` | 200 | `contracts/http/identity/v1/password-change/contract.toml` | `055b9ef6fb6eceed4b2770f42a23bf29d70d2271475c6418cc8337fddce49602` | `6e518a5eb318c0979189babca8ed856c7b39cdf68d004cdbf724893cc8940fe9` |
| `identity.policies-create` | POST | `/api/v1/identity/policies` | 201 | `contracts/http/identity/v1/policies-create/contract.toml` | `b5a1dcf14b50dc0fb400e6cbcde9896da07a26977ce9bfad59e131a0dd721a29` | `f0486800c8a868755f2191132d89a60c94e50792da83f91a6c5b3677946d9abd` |
| `identity.policies-deactivate` | POST | `/api/v1/identity/policies/{policyId}/deactivate` | 200 | `contracts/http/identity/v1/policies-deactivate/contract.toml` | `eafc047bc38dcc84e5440bd246a2796bc98a7ab8dd88edd8f4adb986fc2ebc65` | `07c6e96914664482fd982c44264e15955c0c066cc434e8bed24f39c34df9a0df` |
| `identity.policies-get` | GET | `/api/v1/identity/policies/{policyId}` | 200 | `contracts/http/identity/v1/policies-get/contract.toml` | `389e06c4fca071d6b737d86cb6ccaa52966b1e9121c0652f89fa1327bb148277` | `cdc5db7e0e01959c37c0c224721e89a7b567f98aab4e090883582be91c6978e5` |
| `identity.policies-list` | GET | `/api/v1/identity/policies` | 200 | `contracts/http/identity/v1/policies-list/contract.toml` | `9cabc6ac741b77b4e341914a76b9bd4cc9a97744defff7c72967460b995f1e00` | `608b9af54d7b52b995ad50ab0fca4d57a3c5939bf2d01cac443ac1c5b08bf014` |
| `identity.policies-update` | PUT | `/api/v1/identity/policies/{policyId}` | 200 | `contracts/http/identity/v1/policies-update/contract.toml` | `96276930f07b030376ebf56a8be58fffaffdb2794178f6e8658a310d4ce05940` | `dc5c1734cdf1846a59644181153184e1f809daf555adbf457d0a9567e608a06d` |
| `identity.profile` | GET | `/api/v1/identity/profile` | 200 | `contracts/http/identity/v1/profile/contract.toml` | `244bc4c19657d111bffa7f2f40373f87dcd78fd6c6acb762f4abbc08145e1c70` | `6963ea41f2c8f3d0ac0743f8eca51ec217a306c659b1fe1a02a6c6f3400b50b9` |
| `identity.refresh` | POST | `/api/v1/identity/refresh` | 201 | `contracts/http/identity/v1/refresh/contract.toml` | `e8e053ae57791d81d8089c12289f81e8dfae7844c9338c41381b22130e8d7c9b` | `f41bd9bfc8e745fb4a86c884d2531896852a8b953aafee87f5b0e2f565e562e6` |
| `identity.roles-assign` | POST | `/api/v1/identity/roles/{roleId}/bindings` | 201 | `contracts/http/identity/v1/roles-assign/contract.toml` | `c9414f14248c596ceb2d85cb262d34402c8702be487881aa2053ccddf1ff5b0f` | `e883deeb83574fec973e3c25d839b5138a560cd79cd86fdf89be9fed0df82712` |
| `identity.roles-list` | GET | `/api/v1/identity/roles` | 200 | `contracts/http/identity/v1/roles-list/contract.toml` | `7b5f95484acaac845a49868eb53c0b22f97c8361c6f3eb6e1bd3f9d38c03a286` | `c88538246c6522d039744d63a0e72245758c2d2590c8681b2b59698ba254a13b` |
| `identity.roles-revoke` | DELETE | `/api/v1/identity/roles/{roleId}/bindings/{subject}` | 200 | `contracts/http/identity/v1/roles-revoke/contract.toml` | `90caa4072598f5b8342582c2661a85164e31dce05a2de1b94173b96feb9765af` | `6516eb78cd75e2d3ccd0aa947c2c2e83aa9d72140525b69e767e77026ee84ce3` |
| `runtime.inventory` | GET | `/api/v1/runtime/inventory` | 200 | `contracts/http/runtime/v1/inventory/contract.toml` | `e7f8d09e8d049eef78bbcb5234808dcfba9a832ea57733c2960ad2305742a571` | `b8406176e91643b32b4c2dfe4f7ac98020905cd9126aba280ea5ba5fb5185b47` |
| `settings.config-publish` | POST | `/api/v1/settings/configs` | 201 | `contracts/http/settings/v1/contract.toml` | `b2e84b22ba317b6b97ff57c5d176313c7faecb7bef5609032110ba992f3c4590` | `9368e70c18fecff35bdcc15a3a518eee53a3419d77cea6c72e563127af56651b` |
| `settings.secret-publish` | POST | `/api/v1/settings/secrets` | 201 | `contracts/http/settings/v2/contract.toml` | `fe9adcdfa49c4ff53ad40d5747be81ef13179383f1e4b5a2233d6c251fde0e60` | `14e986f2efd4a05d94423b425c61b8d71ec0eff1e08b75aefeb100f101c391a8` |
| `settings.config-get` | GET | `/api/v1/settings/configs/{key}` | 200 | `contracts/http/settings/v4/contract.toml` | `06664c97e453d441a332cb9aab08d9ba63a10783afba6c6791c1b53b2a3a2333` | `e24e2efc0831f66d2c9e89c7d3f5d11760e0a7093efbbcb8a07614ddc1bd1d20` |
| `settings.config-delete` | DELETE | `/api/v1/settings/configs/{key}` | 204 | `contracts/http/settings/v5/contract.toml` | `f452100480f9e5727d4073642eedc56ce1a93a60d6dd07e0a5e356f7e7f4fc48` | `7431ab4858652efa49ed7ee6ceafe1570ddf1d4d9a7364df9c4e2b2d6b32316f` |
| `settings.config-rollback` | POST | `/api/v1/settings/configs/{key}/rollbacks` | 201 | `contracts/http/settings/v6/contract.toml` | `b1b103d5b13511051dbe696dec31cf0c6f1c07ed1408a2a99e89a5afe4001396` | `ea545bdbaa7995e0f366a0df1c99dad73b379563098aea2bfad98cf8b7874766` |
| `settings.secret-resolve` | GET | `/api/v1/settings/secrets/{key}/material` | 200 | `contracts/http/settings/v7/contract.toml` | `170da93c84b0b1d752d0066d14e907766e106531e6f14e260db6a86073e7eb09` | `bd8d7f235164904c435bf3ada4c9b39be7d926dca2def300309c05399bde2833` |

The policy schemas also reference
`contracts/components/identity/v1/common-abac-operator.schema.json`, whose raw
SHA-256 is `0a124adb46ca042dae2f3ebcc5baa44e3340da7d6999b6f3c4ee0e9f5405604b`.
It remains owned by RSS and is not copied into the Web bundle.

For `audit.list-entries`, the declared 400 schema SHA-256 is
`cbe15bf4d7a1685ece8b0ccfb3ca6ff515c77ee53554f628a683a248f18e87ed`
and the declared 500 schema SHA-256 is
`ee69bc2df46124db112fa8eb5767533ada4fa1601fedd2f96c9fb5d60b6d1dab`.

## Explicit exclusions

- Contract seeds under `_seed` are templates, not consumable contracts.
- Identity device contracts under `contracts/http/identity/v2` are drafts and
  are not part of this baseline.
- Contract TOML, JSON schemas, parsers, descriptor registries, and generated
  backend types are not copied into RSS Web or loaded at runtime.

The transport implements only protocol mechanics. Domain DTOs, endpoint
adapters, authentication, tenant headers, retries, and UI behavior belong to
their explicit follow-up issues.

## Consumption status

The handwritten adapters for `identity.login`, `identity.refresh`,
`identity.profile`, `identity.logout`, and `identity.logout-all` were enabled by
WEB-PR-005. At implementation time the read-only RSS checkout was at
`475bfa88e17769899916b69f357261160000b01b`; a Git tree comparison confirmed
that all five contract and schema files were byte-identical to this document's
pinned `b513d3390d73d4f291bb31afc588ca1307ce19af` evidence.

WEB-PR-012 enabled handwritten clients for `runtime.inventory` and ambient-tenant
`audit.list-entries` against the clean, read-only RSS revision
`b7f3e1d0bcc5b2e59639a81b4f37937914b53f00`. Audit's contract, request, response, 400, and 500 files
remained byte-identical to the original evidence. Runtime's request remained
`e7f8d09e8d049eef78bbcb5234808dcfba9a832ea57733c2960ad2305742a571`; the current contract TOML is
`5e9e8df12de3fa2962b08a13f64716209f303d12465f6a851bb112e8256ddce5`, response schema is
`b6f6f369a34ec843124ec5b331d7a5126369a6990167b53bdacd9af318f6dbec`, declared 500 schema is
`086c3fb0936f05965729ef7b7ec331c5eae54318078092219c56a164d5ab4765`, and declared 503 schema is
`2f50c56345873186e668b4f0795203c92d259a4da864934999291cf63324c170`. The decoder intentionally
adopts the current `providerPosture.state=unobserved` value without an old-enum alias.

WEB-PR-014 extends that same pinned `runtime.inventory` consumption into a dedicated facts page. It
does not change the selected contract or introduce another baseline: the strict decoder consumes the
complete current wire schema, while its public projection discards listener/placement endpoints and
SPIFFE identities after validation. The page treats build metadata as a launch declaration rather
than browser-verified artifact provenance and renders `unobserved` as a known current state.

WEB-PR-015 enables `audit.list-tenant-entries` against the same read-only RSS revision
`b7f3e1d0bcc5b2e59639a81b4f37937914b53f00`. Its contract TOML is
`c60d51a58ca33da3b3d74e4779ca53250239d93c0a921d0163c44fc0f9dc5b79`; the request and response
schema hashes remain `36c75a1ecba6ecd027be66f5819bb02785b18007bd20674435a1e4e2705e81c0` and
`c3f0b3e61b9574fc822262d4b1052045cae714b4c15570e239537b48d6f358c7`. It is an audited SuperAdmin
operation with non-idempotent HTTP semantics: each explicitly submitted page is sent exactly once,
without prefetch, automatic retry, 401 replay, client-side SuperAdmin inference, or runtime schema
loading. The target tenant is only a canonical path coordinate and never becomes a browser-authored
tenant header.

WEB-PR-016 enables `identity.password-change` against the same read-only RSS revision
`b7f3e1d0bcc5b2e59639a81b4f37937914b53f00`. The contract, request, and response SHA-256 values are
`6798727427fbdfffa1f226b2734cbe808341d772b4413465d5376c3e3fa7eeb1`,
`055b9ef6fb6eceed4b2770f42a23bf29d70d2271475c6418cc8337fddce49602`, and
`6e518a5eb318c0979189babca8ed856c7b39cdf68d004cdbf724893cc8940fe9`. The Web sends this
non-idempotent OutboxFact command exactly once through the protected no-replay session policy. A
confirmed change clears all local authority before resolving; credential drift and commit-unknown
results fail closed. RSS remains authoritative for Unicode normalization, length, compromised-secret
policy, grant-family revocation, and transaction outcome; schemas are neither copied nor loaded.

WEB-PR-017 enables `identity.account-status-get` and `identity.account-status-set` against the same
read-only RSS revision `b7f3e1d0bcc5b2e59639a81b4f37937914b53f00`. Their contract TOML hashes are
`f16b94f6991e9fa319d3f87d753bd85509258587144434d191a95c81ee2d942f` and
`6b5c5996b1852b72d571adc766b1fdd0d108919f901ef55800b14feda35b7c70`; request and response hashes
remain those recorded in the baseline table. The Web accepts only an explicitly submitted canonical
non-nil `userId` path coordinate and the closed four-value lifecycle. It does not provide directory
lookup, mock/provider fallback, tenant input, or optimistic facts. A self-target non-active result or
commit-unknown write atomically clears local authority; the idempotent PUT is never automatically
retried after network, timeout, conflict, or server failure.

WEB-PR-018 enables `identity.roles-list`, `identity.roles-assign`, and `identity.roles-revoke` against
the same read-only RSS revision `b7f3e1d0bcc5b2e59639a81b4f37937914b53f00`. Their contract TOML
hashes are `4a4e0d7b4f246b4d90f61948afb6eee164beb11a8b60f09f735e5389936271a7`,
`7bff2f144aa5bd51ba67b7a04446c961f9791e28ac06e566cef48789f21fa79d`, and
`f091730db197aa51b4672f37f119453577da4317d0fdfed7c6297cbf10db0da9`; request and response hashes
remain those recorded in the baseline table. List cursor and permission strings stay opaque. Assign is
non-idempotent and uses the no-replay session policy; list and idempotent revoke may use only the
session owner's exact 401 recovery. Subject is explicit PII input, and command receipts never become
an authoritative binding read model.

The pinned runtime's browser login issues only RSS `user` access tokens, while the Identity contract
authorizer admits these three role routes only for an `admin` principal before checking role
permissions. The real-browser acceptance therefore locks the current server-authoritative 403 for
list, assign, and revoke (including no receipt or binding inference); adapter, component, and Edge
tests cover the success contracts and exact routing without inventing an Admin bearer or weakening
RSS. A future consumable Admin authority must be established by an explicit RSS baseline change, not
by Web-side kind inference or a test-only production bypass.

WEB-PR-020 enables `identity.policies-list` and `identity.policies-get` against the clean, read-only
RSS revision `27113ade636d41d065b2789f82326965cd0ea9ec`. Their contract TOML hashes are
`29fef99b450243aeab0a51d1fbffdadcc1a1ac3b26c1af90d24766b4926d0f95` and
`57e225e48f71b344db1c0f08f647cb07948b6427d834ff1c51631b8110231898`; request and response hashes
remain those recorded in the baseline table, and the referenced common operator remains
`0a124adb46ca042dae2f3ebcc5baa44e3340da7d6999b6f3c4ee0e9f5405604b`. The Web consumes the current
family/predicate/typed-operand discriminated shape without schema copies or legacy aliases, validates
effective int64 values as safe JavaScript integers, and performs explicit cursor loading plus a
separate detail read. Policy rules and obligations are displayed RSS facts only; neither the Identity
package nor Vue evaluates ABAC or derives effective authority.

WEB-PR-021 additionally consumes `identity.policies-create`, `identity.policies-update`, and
`identity.policies-deactivate` against the same reviewed RSS tree. Their contract TOML hashes are
`66d5105d3a846d525d1cbd742064b98eb6c5adaf078df95d3a855cde4e2c7dfe`,
`4f1c18ae74a4e963c3d9ad83b47645618d93e22411ce347ad5a12b21b9c56e2e`, and
`cde7f396da804bfa7fd151cfd43fe2ad7c3c2481de830a5ac3502b952ff16084`; request and response hashes
remain those recorded in the baseline table. All three contracts are idempotent and use the sole
session transport's exact-401 recovery. Other failures are never auto-replayed: CAS conflicts and
commit-unknown outcomes retain the local draft until an explicit server re-read. The current browser
login authority remains User, so real RSS acceptance records final 403 for all three writes instead of
fabricating Admin authority. No schema copy, evaluator, or policy provider is introduced.
