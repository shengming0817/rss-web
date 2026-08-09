# Same-origin Edge and deployment-fixed tenant bootstrap

Status: accepted, 2026-08-09.

## Decision

RSS Web has one browser origin. Nginx serves the SPA and proxies a closed set of
relative `/api/...` paths to two listeners of one RSS `runtime` assembly:

| Browser path | RSS listener | Tenant header behavior |
| --- | --- | --- |
| `/api/v1/identity/**` | Primary | cleared, except exact login and refresh |
| `/api/v1/settings/**` | Primary | cleared |
| `/api/v1/audit/**` | Admin | cleared |
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

Deployment requires a non-nil canonical lowercase-hyphenated tenant UUID and
separate typed host/port fields for both listeners. Invalid or incomplete input
stops the container before Nginx starts. Arbitrary upstream URLs are not accepted.

## Reviewed RSS evidence

The route table was reviewed against RSS revision
`475bfa88e17769899916b69f357261160000b01b`:

- `assemblies/runtime/assembly.toml`: `86013539f14d26dffc9e83a35e6cec95b2d764f55001cdd06b0f133fa9743463`
- `assemblies/runtime/runtime-plan.json`: `6f2d970a4be08ba9a15febc19d0134fda3495ad7b93d930141f2235be14227cb`
- `assemblies/runtime/assembly.lock.json`: `d25961002433c97ed8eecdbd309cf22e6c5c6643b16ef580c6af1c1522df39a9`
- lock manifest digest: `sha256:92c2175bc6443934e068f6977f7f41927a92f7e62e13c3d0001bbfee475b220f`
- assembly fingerprint: `sha256:c1108a3f19948eb46cb8e6f883b6ffa04520df0a61d69f18a26b270789bc6a36`

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

Rollback is an atomic revert of this Edge change. Partial rollback, dual routing,
header aliases, and browser runtime base URLs are not supported.
