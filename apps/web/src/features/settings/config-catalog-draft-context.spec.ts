import { describe, expect, it } from 'vitest'
import { createConfigCatalogDraftHandoff } from './config-catalog-draft-context'
import { CONFIG_CATALOG_PREVIEW_ROWS } from '@rss/settings/preview'

describe('Config Catalog draft handoff', () => {
  it('stages a reviewed synthetic key for one consumption only', () => {
    const handoff = createConfigCatalogDraftHandoff()
    expect(handoff.stage(CONFIG_CATALOG_PREVIEW_ROWS[0]!)).toBe(true)
    expect(handoff.consume()).toEqual({ key: 'preview.example.appearance.theme' })
    expect(handoff.consume()).toBeUndefined()
  })

  it('starts without a staged key', () => {
    const handoff = createConfigCatalogDraftHandoff()
    expect(handoff.consume()).toBeUndefined()
  })

  it('rejects a branded spread with a substituted key', () => {
    const handoff = createConfigCatalogDraftHandoff()
    const forged = { ...CONFIG_CATALOG_PREVIEW_ROWS[0]!, key: 'production.database.password' }
    expect(handoff.stage(forged)).toBe(false)
    expect(handoff.consume()).toBeUndefined()
  })
})
