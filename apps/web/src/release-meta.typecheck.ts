import type { WebReleaseMeta } from './release-meta'

declare const meta: WebReleaseMeta

// @ts-expect-error Release metadata is immutable build evidence.
meta.web.revision = 'b'.repeat(40)
// @ts-expect-error The selected-contract ledger identity is immutable build evidence.
meta.rssContractLedger.id = 'another-ledger'
const unknownPreview: (typeof meta.previewSources)[number] = {
  // @ts-expect-error Preview identities are a closed union.
  id: 'unknown',
  // @ts-expect-error Preview sources cannot be forged from another source kind.
  source: meta.web.source,
}
// @ts-expect-error Source metadata is owned by the factory, not caller input.
meta.previewSources.push({ id: 'role-bindings', source: meta.web.source })
void unknownPreview
