# Same-origin Edge and deployment-fixed tenant bootstrap

Status: accepted, 2026-08-09.

## Decision

RSS Web has one browser origin. Nginx serves the SPA and proxies a closed set of
relative `/api/...` paths to two listeners of one RSS `runtime` assembly:

| Browser path | RSS listener | Tenant header behavior |
| --- | --- | --- |
| `/api/v1/identity/**` | Primary | cleared, except exact login and refresh |
| `/api/v1/settings/**` | Primary | cleared |
| exact `/api/v1/audit/entries` | Admin | cleared |
| exact canonical `/api/v1/audit/tenants/{tenantId}/entries` | Admin | cleared |
| exact `/api/v1/runtime/inventory` | Admin | cleared |

Exact login and refresh requests receive one deployment-fixed canonical tenant
UUID after any browser-supplied value is removed. The fixed value is only the
RSS pre-authentication `populate-only` input. It is not cryptographic authority,
is never selected by the browser, and is not inferred from storage, hostnames,
routes, profiles, or token bodies.

All other `/api`, `/internal`, `/health`, and metrics paths return 404 without
upstream traffic. Primary and Admin have no fallback to each other. The Edge
does not implement authentication, session state, retries, DTO decoding, policy,
or backend discovery.

WEB-PR-015 adds only the canonical lowercase, non-nil UUID target-Audit route. Uppercase, nil,
malformed, encoded-slash, trailing-segment, and trailing-slash variants remain 404. The target UUID
is a resource coordinate, not tenant authority, and the browser header is still removed. Because the
RSS contract is non-idempotent and durably audits every authorized page request, neither the Edge nor
the Web session transport retries or replays it.

Deployment requires a non-nil canonical lowercase-hyphenated tenant UUID and
separate typed host/port fields for both listeners. Invalid or incomplete input
stops the container before Nginx starts. Arbitrary upstream URLs are not accepted.

## Reviewed RSS evidence

The currently consumed route table was re-reviewed for WEB-PR-012 against RSS revision
`b7f3e1d0bcc5b2e59639a81b4f37937914b53f00`:

- `assemblies/runtime/assembly.toml`: `4fbe9262515845ec94cdd42ead7d8e78333361520b46ab538e50a6e52580b092`
- `assemblies/runtime/runtime-plan.json`: `b59231e06dde78efff866df4efa636f3a261d2bfd35a1be78dfa1bc99d33c425`
- `assemblies/runtime/assembly.lock.json`: `6088747ce9f2219164d26fa6dfcea0f758b5986ccad4b2550da05bf62b36ea45`

The original WEB-PR-006 evidence at `475bfa88e17769899916b69f357261160000b01b`
remains historical provenance, not the current consumption claim.

Primary owns Identity and Settings. Admin owns Audit and the framework
`runtime.inventory` contract. Internal and Health listeners are deliberately not
reachable through RSS Web. This ADR is review evidence; it is not a runtime
registry or a copied backend contract.

## Deployment and rejected alternatives

The intended production topology places the Edge and the RSS runtime in the
same pod or network namespace with loopback/private listener connectivity. RSS
plaintext listener opt-in is for explicitly controlled development environments,
not a public-network transport policy.

Hostname-derived tenants, route-derived tenants, login-form tenant input, and a
resolver SPI were rejected because they make browser-controlled data part of
tenant bootstrap. A minimal application server was rejected because Nginx can
enforce this fixed route/header transformation without adding a second authority
or transport implementation. Mixing separate RSS assemblies was rejected because
it is not the reviewed two-listener runtime topology.

Rollback is an atomic revert of the owning Edge change. Partial rollback, dual routing,
header aliases, and browser runtime base URLs are not supported.
