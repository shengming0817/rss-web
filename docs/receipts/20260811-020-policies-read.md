# WEB-PR-020 Policies read receipt

## Dependency and source

- WEB-PR-010 and WEB-PR-011 were merged before this branch; the implementation base was
  `7b8a0ce5cc82a9e9072f6ec5a5f5f3f302311f6e`.
- Contract review used the current read-only RSS tree at `27113ade`; the archived real journey remains
  pinned to the reviewed RSS revision `b7f3e1d0bcc5b2e59639a81b4f37937914b53f00`.
- `identity.policies-list` contract/request/response SHA-256 values are
  `29fef99b450243aeab0a51d1fbffdadcc1a1ac3b26c1af90d24766b4926d0f95`,
  `9cabc6ac741b77b4e341914a76b9bd4cc9a97744defff7c72967460b995f1e00`, and
  `608b9af54d7b52b995ad50ab0fca4d57a3c5939bf2d01cac443ac1c5b08bf014`.
- `identity.policies-get` contract/request/response SHA-256 values are
  `57e225e48f71b344db1c0f08f647cb07948b6427d834ff1c51631b8110231898`,
  `389e06c4fca071d6b737d86cb6ccaa52966b1e9121c0652f89fa1327bb148277`, and
  `cdc5db7e0e01959c37c0c224721e89a7b567f98aab4e090883582be91c6978e5`.
- The referenced common ABAC operator schema SHA-256 is
  `0a124adb46ca042dae2f3ebcc5baa44e3340da7d6999b6f3c4ee0e9f5405604b`.
- These hashes are review evidence only. No RSS schema copy, runtime parser, descriptor registry,
  policy evaluator, provider SPI, mock fallback, or backend issue was added.

## Delivered boundary

- `@rss/identity` owns strict DTOs/decoders and one injected Policies client for the exact list and get
  coordinates. Policy IDs are branded only after contract validation; cursors and policy facts remain
  server data.
- Both idempotent reads use the existing protected session transport and its exact-401 single-flight
  recovery. There is no independent bearer owner, automatic non-session retry, prefetch, stale-data
  fallback, or direct Axios path.
- The catalog uses explicit next-page loading with cursor, duplicate-ID, generation, and abort fences.
  Detail loading is a separate operation and never converts a list row into an authoritative detail.
- The Web view renders the current equality, ordering, membership, and pattern operator families,
  typed operands, row scope, field masks, and effective windows as facts. It does not evaluate ABAC,
  predict allow/deny, infer permissions from profile kind, or construct a policy editing model.
- `/policies` is session-protected and carries exact list/get UX intents. Vue remains under `apps/web`;
  the framework-neutral API surface remains under `@rss/identity`.

## Authority and real RSS finding

- RSS is authoritative for route admission, policy visibility, policy contents, cursor order, and all
  ABAC meaning. The browser cannot author tenant or bearer headers, and the existing Identity prefix
  routes both operations to Primary while stripping forged tenant input.
- The real fixture grants the isolated real user only the exact list/get contract and permission pairs.
  Successful real list and detail therefore prove the RSS ABAC path rather than a profile-kind shortcut;
  a limited user still receives the final server 403.
- The first product run correctly rejected a seeded `rowScope` obligation on the non-projection list
  route. The fixture was corrected by removing that invalid obligation, not by weakening RSS or adding
  a Web fallback. The final archived run then passed all phases.

## Verification

- Frozen install, workspace typecheck, lint, format check, 747 unit/root tests, 692 coverage tests, 55
  boundary tests, production build, built-identity scan, and diff check passed.
- Seventeen default Chromium journeys passed, including list-to-detail success, explicit next/detail
  interaction, closed navigation, safe source metadata, and final 403 handling.
- Docker/Nginx Edge smoke passed exact list/get methods and paths, bearer pass-through, forged tenant
  removal, Primary routing, listener isolation, and checked teardown.
- The opt-in real runner archived clean Web implementation
  `91eca4d2246483818ba590e27c670a08e2cef70c` and pinned RSS revision
  `b7f3e1d0bcc5b2e59639a81b4f37937914b53f00`. Main, password-change,
  account-status-self, roles, rate-limited, budget-exhausted, Admin-down, and Primary-down phases passed;
  checked cleanup passed.
- Initial Docker image resolution failures were classified as environment failures with no retained
  Compose project. After the public frontend image was pulled, Edge and the final real run completed.
  The invalid-obligation run was recorded as a product failure with checked cleanup before correction.

## Four-principle check

- Thorough: exact contracts, error policies, strict DTOs, all current operator families, cursor/detail
  state, safe errors, authority, browser behavior, Edge routing, and real RSS evidence close together.
- Breaking: there is one real adapter and no legacy operator vocabulary, evaluator, provider/mock,
  compatibility alias, dual authority mode, stale fallback, or schema copy.
- Simple: the slice reuses `@rss/api`, `@rss/identity`, the single session transport, authorization UX
  context, router metadata, source/error components, and the existing Identity Edge route.
- AI-HARD: exact-record decoders, branded IDs, closed operator carriers, cursor/generation fences,
  production scans, exact request tests, archived-source evidence, and checked teardown enforce the design.

## Changed-line classification

- Semantic handwritten code and locale content: 1,151 additions / 3 deletions.
- Unit/type/boundary/browser/Edge/real tests and harness: 792 additions / 2 deletions.
- Documentation and governance: 29 additions / 1 deletion.
- Generated and lockfile: 0 lines.
- Implementation total excluding this receipt: 1,972 additions / 6 deletions.

## Rollback

Revert this PR as one unit. That removes the endpoint coordinates, Policies DTOs/client, pagination and
detail operations, context/view/navigation, browser/Edge/real proof, and consumption note together while
preserving the previously merged Roles and Identity session slices. Do not retain the page with a direct
transport, restore old ABAC operators, or add a compatibility evaluator. After rollback, rerun
API/Identity/Web type checks, boundary tests, Chromium, Edge smoke, and the bounded real RSS journey.
