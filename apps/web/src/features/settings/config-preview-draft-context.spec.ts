import { describe, expect, it } from 'vitest'
import { CONFIG_CATALOG_PREVIEW_ROWS, CONFIG_HISTORY_PREVIEW_ROWS } from '@rss/settings/preview'
import { createConfigPreviewDraftHandoff } from './config-preview-draft-context'

describe('Config Preview draft handoff', () => {
  it('stages each reviewed draft kind for one consumption only', () => {
    const handoff = createConfigPreviewDraftHandoff()
    expect(handoff.stageCatalog(CONFIG_CATALOG_PREVIEW_ROWS[0]!)).toBe(true)
    expect(handoff.consume()).toEqual({
      kind: 'catalog-key',
      key: 'preview.example.appearance.theme',
    })
    expect(handoff.consume()).toBeUndefined()

    expect(handoff.stageHistory(CONFIG_HISTORY_PREVIEW_ROWS[0]!)).toBe(true)
    expect(handoff.consume()).toEqual({
      kind: 'history-rollback',
      key: CONFIG_HISTORY_PREVIEW_ROWS[0]!.key,
      toVersion: CONFIG_HISTORY_PREVIEW_ROWS[0]!.version,
    })
    expect(handoff.consume()).toBeUndefined()
  })

  it('rejects branded spreads and substituted coordinates at runtime', () => {
    const handoff = createConfigPreviewDraftHandoff()
    expect(
      handoff.stageCatalog({
        ...CONFIG_CATALOG_PREVIEW_ROWS[0]!,
        key: 'production.database.password',
      }),
    ).toBe(false)
    expect(
      handoff.stageHistory({
        ...CONFIG_HISTORY_PREVIEW_ROWS[0]!,
        version: CONFIG_HISTORY_PREVIEW_ROWS[0]!.version + 1,
      }),
    ).toBe(false)
    expect(handoff.consume()).toBeUndefined()
  })
})
