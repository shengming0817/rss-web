import { describe, expect, it } from 'vitest'
import { MOCK_SOURCE } from '@rss/shared'
import { CONFIG_CATALOG_PREVIEW_ROWS } from '../catalog/preview'
import { CONFIG_HISTORY_PREVIEW_ROWS } from '../preview'

const catalogKeys = new Set(CONFIG_CATALOG_PREVIEW_ROWS.map((row) => row.key))

describe('Config History Preview', () => {
  it('contains only frozen synthetic version coordinates with sealed Mock provenance', () => {
    expect(CONFIG_HISTORY_PREVIEW_ROWS.length).toBeGreaterThan(0)
    expect(Object.isFrozen(CONFIG_HISTORY_PREVIEW_ROWS)).toBe(true)

    for (const row of CONFIG_HISTORY_PREVIEW_ROWS) {
      expect(catalogKeys.has(row.key)).toBe(true)
      expect(Number.isSafeInteger(row.version)).toBe(true)
      expect(row.version).toBeGreaterThan(0)
      expect(row.source).toBe(MOCK_SOURCE)
      expect(Object.isFrozen(row)).toBe(true)
      expect(Object.keys(row).sort()).toEqual(['key', 'source', 'version'])
      expect(JSON.stringify(row)).not.toMatch(
        /value|diff|secret|material|current|latest|provider|transport/i,
      )
    }
  })

  it('uses unique deterministic coordinates derived from Catalog fixture keys', () => {
    const coordinates = CONFIG_HISTORY_PREVIEW_ROWS.map((row) => `${row.key}@${row.version}`)
    expect(new Set(coordinates).size).toBe(coordinates.length)
    expect(CONFIG_HISTORY_PREVIEW_ROWS.map((row) => row.key)).toEqual([
      CONFIG_CATALOG_PREVIEW_ROWS[0]!.key,
      CONFIG_CATALOG_PREVIEW_ROWS[0]!.key,
      CONFIG_CATALOG_PREVIEW_ROWS[1]!.key,
      CONFIG_CATALOG_PREVIEW_ROWS[1]!.key,
      CONFIG_CATALOG_PREVIEW_ROWS[2]!.key,
      CONFIG_CATALOG_PREVIEW_ROWS[2]!.key,
      CONFIG_CATALOG_PREVIEW_ROWS[3]!.key,
      CONFIG_CATALOG_PREVIEW_ROWS[3]!.key,
    ])
  })

  it('does not admit a spread copy as a reviewed fixture identity', () => {
    const reviewed = CONFIG_HISTORY_PREVIEW_ROWS[0]!
    const forged = { ...reviewed, version: reviewed.version + 1 }
    expect(CONFIG_HISTORY_PREVIEW_ROWS.includes(forged)).toBe(false)
  })
})
