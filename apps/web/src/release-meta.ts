import { EXTERNAL_SOURCE, MOCK_SOURCE } from '@rss/shared'

const WEB_REVISION = /^[0-9a-f]{40}$/

export const PREVIEW_SOURCE_IDS = ['role-bindings', 'config-catalog', 'config-history'] as const
export type PreviewSourceId = (typeof PREVIEW_SOURCE_IDS)[number]

export interface PreviewReleaseSource {
  readonly id: PreviewSourceId
  readonly source: typeof MOCK_SOURCE
}

export interface WebReleaseMeta {
  readonly web: Readonly<{
    readonly revision: string
    readonly source: typeof EXTERNAL_SOURCE
  }>
  readonly rssContractLedger: Readonly<{
    readonly id: '20260812-release-consumed-contracts'
    readonly sourceRevision: '1f6c131f0759f921551a81e12e0adb0071346927'
    readonly source: typeof EXTERNAL_SOURCE
  }>
  readonly previewSources: readonly PreviewReleaseSource[]
}

export interface WebReleaseFlags {
  readonly roleBindingsPreview: boolean
  readonly configCatalogPreview: boolean
  readonly configHistoryPreview: boolean
}

export interface WebReleaseMetaInput extends WebReleaseFlags {
  readonly webRevision: string
}

function previewSource(id: PreviewSourceId): PreviewReleaseSource {
  return Object.freeze({ id, source: MOCK_SOURCE })
}

export function createWebReleaseMeta(input: WebReleaseMetaInput): WebReleaseMeta {
  if (input.webRevision !== 'development' && !WEB_REVISION.test(input.webRevision)) {
    throw new Error('Web build revision must be a lowercase 40-character Git SHA')
  }
  const previewSources = Object.freeze([
    ...(input.roleBindingsPreview ? [previewSource('role-bindings')] : []),
    ...(input.configCatalogPreview ? [previewSource('config-catalog')] : []),
    ...(input.configHistoryPreview ? [previewSource('config-history')] : []),
  ])
  return Object.freeze({
    web: Object.freeze({ revision: input.webRevision, source: EXTERNAL_SOURCE }),
    rssContractLedger: Object.freeze({
      id: '20260812-release-consumed-contracts',
      sourceRevision: '1f6c131f0759f921551a81e12e0adb0071346927',
      source: EXTERNAL_SOURCE,
    }),
    previewSources,
  })
}

export function createCurrentWebReleaseMeta(flags: WebReleaseFlags): WebReleaseMeta {
  return createWebReleaseMeta({ webRevision: __RSS_WEB_REVISION__, ...flags })
}
