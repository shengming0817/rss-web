import { describe, expect, it } from 'vitest'
import { MOCK_SOURCE } from '@rss/shared'
import { CONFIG_CATALOG_PREVIEW_ROWS, queryConfigCatalogPreview } from './preview'

describe('Config Catalog Preview', () => {
  it('contains only frozen synthetic metadata with sealed Mock provenance', () => {
    expect(CONFIG_CATALOG_PREVIEW_ROWS.length).toBeGreaterThan(0)
    expect(Object.isFrozen(CONFIG_CATALOG_PREVIEW_ROWS)).toBe(true)
    for (const row of CONFIG_CATALOG_PREVIEW_ROWS) {
      expect(row.key).toMatch(/^preview\.example\./)
      expect(row.source).toBe(MOCK_SOURCE)
      expect(Object.isFrozen(row)).toBe(true)
      expect(Object.keys(row).sort()).toEqual(['key', 'label', 'source'])
      expect(JSON.stringify(row)).not.toMatch(/value|version|tenant|secret|endpoint|receipt/i)
    }
  })

  it('filters and pages locally without cursor semantics', () => {
    const result = queryConfigCatalogPreview({
      search: 'THEME',
      prefix: 'preview.example.',
      page: 1,
    })
    expect(result.rows.map((row) => row.key)).toEqual(['preview.example.appearance.theme'])
    expect(result).toMatchObject({ page: 1, hasMore: false })
    expect(result).not.toHaveProperty('cursor')
    expect(result).not.toHaveProperty('total')
    expect(queryConfigCatalogPreview({ page: 99 }).rows).toEqual([])
  })
})
