# Static Web/Edge rollback

This runbook rolls back the complete immutable Web/Edge image. It does not copy individual assets,
reuse a mutable tag as evidence, switch RSS revisions, or introduce a second route or backend.

## Preconditions

- Select a previously attested image by immutable registry digest and record its lowercase 40-character
  Web source revision.
- Keep the deployment-owned tenant and Primary/Admin listener coordinates unchanged.
- Confirm that the selected release's consumed-contract ledger and real-journey support statement are
  acceptable for the deployment. A reviewed RSS revision is not automatically a supported runtime.
- Preserve the current image digest so forward recovery is a single inverse deployment action.

## Atomic rollback

1. Resolve and verify the previous image digest without pulling by a mutable release tag.
2. Update the deployment's single Edge image reference to that digest. Do not mount or copy individual
   `index.html`, `theme-init.js`, asset, Nginx template, or snippet files.
3. Recreate the Edge container as one unit while retaining the existing tenant and listener settings.
4. Wait for the container health check. If it fails, restore the recorded candidate digest; do not add
   an alternate proxy route or serve mixed assets.

## Required verification

- The running container image ID/digest and OCI `org.opencontainers.image.revision` label match the
  selected rollback image and Web revision.
- Authenticated About displays that Web revision and the exact contract-evidence identity declared by
  that release. A ledger-aware release shows its ledger ID/revision; the canonical legacy rollback
  `a2b90c97…` shows historical baseline `20260809-current-rss-baseline` at
  `b513d3390d73d4f291bb31afc588ca1307ce19af` and must not be relabelled as a compatibility ledger.
- `/`, `/index.html`, and `/theme-init.js` have the reviewed no-store shell policy and security headers.
- Every rollback hashed asset is available with the immutable cache policy; candidate-only assets are
  404, proving that releases were not mixed.
- A Primary identity request and an Admin runtime request still reach their distinct reviewed listeners.
- Container/network cleanup or failed replacement is checked explicitly.

The canonical executable carrier is `pnpm test:edge`. It builds the candidate and the prior
`a2b90c97d2da7079b0a593fd7b445fd595e6b897` revision from clean Git archives, proves their image
digests differ, deploys the candidate, selects the prior image by digest, performs the checks above,
and tears down containers, networks, temporary archives, and local test images.

## Scope of the evidence

Passing this smoke proves the listed static delivery and proxy invariants for the two named Web
revisions. It is not a rollback control plane, an RSS rollback, a whole-runtime compatibility claim,
or N/N-1 certification. Production operators remain responsible for registry retention, deployment
authorization, rollout health, and forward recovery.
