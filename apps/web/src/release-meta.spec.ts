import { describe, expect, it } from 'vitest'
import { EXTERNAL_SOURCE, MOCK_SOURCE } from '@rss/shared'
import { createWebReleaseMeta } from './release-meta'

const revision = 'a'.repeat(40)

describe('Web release metadata', () => {
  it('freezes build and selected-contract ledger facts as external release evidence', () => {
    const meta = createWebReleaseMeta({
      webRevision: revision,
      roleBindingsPreview: false,
      configCatalogPreview: false,
      configHistoryPreview: false,
    })

    expect(meta).toEqual({
      web: { revision, source: EXTERNAL_SOURCE },
      rssContractLedger: {
        id: '20260812-release-consumed-contracts',
        sourceRevision: '1f6c131f0759f921551a81e12e0adb0071346927',
        source: EXTERNAL_SOURCE,
      },
      previewSources: [],
    })
    expect(Object.isFrozen(meta)).toBe(true)
    expect(Object.isFrozen(meta.web)).toBe(true)
    expect(Object.isFrozen(meta.rssContractLedger)).toBe(true)
    expect(Object.isFrozen(meta.previewSources)).toBe(true)
  })

  it('derives only explicitly enabled Preview source identities in a stable order', () => {
    for (const [flags, ids] of [
      [
        { roleBindingsPreview: false, configCatalogPreview: false, configHistoryPreview: false },
        [],
      ],
      [
        { roleBindingsPreview: true, configCatalogPreview: false, configHistoryPreview: false },
        ['role-bindings'],
      ],
      [
        { roleBindingsPreview: false, configCatalogPreview: true, configHistoryPreview: false },
        ['config-catalog'],
      ],
      [
        { roleBindingsPreview: false, configCatalogPreview: false, configHistoryPreview: true },
        ['config-history'],
      ],
      [
        { roleBindingsPreview: true, configCatalogPreview: true, configHistoryPreview: true },
        ['role-bindings', 'config-catalog', 'config-history'],
      ],
    ] as const) {
      const meta = createWebReleaseMeta({ webRevision: revision, ...flags })
      expect(meta.previewSources.map((source) => source.id)).toEqual(ids)
      for (const source of meta.previewSources) {
        expect(source.source).toBe(MOCK_SOURCE)
        expect(Object.isFrozen(source)).toBe(true)
      }
    }
  })

  it('fails closed for an invalid build revision', () => {
    expect(() =>
      createWebReleaseMeta({
        webRevision: 'main',
        roleBindingsPreview: false,
        configCatalogPreview: false,
        configHistoryPreview: false,
      }),
    ).toThrow('Web build revision')
  })
})
