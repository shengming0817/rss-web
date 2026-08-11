import { describe, expect, it } from 'vitest'
import { MOCK_SOURCE } from '@rss/shared'
import { CONFIG_CATALOG_PREVIEW_ROWS, queryConfigCatalogPreview } from './preview'
import { isConfigCatalogPreviewRow } from '../preview-guard'

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

  it('searches labels case-insensitively', () => {
    expect(
      queryConfigCatalogPreview({ search: 'DIGEST PREFERENCE' }).rows.map((row) => row.key),
    ).toEqual(['preview.example.notifications.digest'])
  })

  it('applies a selective key prefix', () => {
    expect(
      queryConfigCatalogPreview({ prefix: 'preview.example.reader.' }).rows.map((row) => row.key),
    ).toEqual(['preview.example.reader.density'])
  })

  it('uses explicit local pages without cursor or remote-total semantics', () => {
    const first = queryConfigCatalogPreview()
    expect(first.rows).toHaveLength(2)
    expect(first).toMatchObject({ page: 1, hasMore: true })
    const second = queryConfigCatalogPreview({ page: 2 })
    expect(second.rows).toHaveLength(2)
    expect(second).toMatchObject({ page: 2, hasMore: false })
    expect(first).not.toHaveProperty('cursor')
    expect(first).not.toHaveProperty('total')
    expect(queryConfigCatalogPreview({ page: 99 }).rows).toEqual([])
  })

  it('recognizes only registered fixture identities', () => {
    expect(isConfigCatalogPreviewRow(CONFIG_CATALOG_PREVIEW_ROWS[0])).toBe(true)
    expect(isConfigCatalogPreviewRow({ ...CONFIG_CATALOG_PREVIEW_ROWS[0]! })).toBe(false)
    expect(isConfigCatalogPreviewRow(undefined)).toBe(false)
  })
})
