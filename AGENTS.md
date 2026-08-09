# RSS Web agent boundary

Read `README.md` and the current migration issue before changing this repository.

- Treat the imported source tree as a historical baseline, not as the RSS
  product or contract truth.
- Do not add backward-compatibility aliases, a dual-backend mode, or silent
  fallback between old and new behavior.
- Delete out-of-scope behavior instead of hiding it behind flags.
- Consume RSS only through explicitly selected active contracts; do not create a
  contract bundle, generic SDK/codegen platform, API gateway, IAM/user-directory,
  MDM/fleet, or hosted-observability product.
- Preserve provenance records under `docs/migration/`; later product changes must
  not rewrite the historical source identity.
