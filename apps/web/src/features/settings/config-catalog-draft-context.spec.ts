import { describe, expect, it } from 'vitest'
import { createConfigCatalogDraftHandoff } from './config-catalog-draft-context'
import { CONFIG_CATALOG_PREVIEW_ROWS } from '@rss/settings/preview'

describe('Config Catalog draft handoff', () => {
  it('stages a reviewed synthetic key for one consumption only', () => {
    const handoff = createConfigCatalogDraftHandoff()
    handoff.stage(CONFIG_CATALOG_PREVIEW_ROWS[0]!)
    expect(handoff.consume()).toEqual({ key: 'preview.example.appearance.theme' })
    expect(handoff.consume()).toBeUndefined()
  })

  it('does not expose a string-based staging seam', () => {
    const handoff = createConfigCatalogDraftHandoff()
    // @ts-expect-error only decoded fixture rows may cross the handoff
    handoff.stage('production.database.password')
    expect(handoff.consume()).toBeUndefined()
  })
})
