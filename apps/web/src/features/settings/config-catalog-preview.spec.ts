import { describe, expect, it } from 'vitest'
import { isConfigCatalogPreviewEnabled } from './config-catalog-preview'

describe('Config Catalog Preview enablement', () => {
  it.each(['development', 'test', 'demo'])('accepts exact true in %s', (mode) => {
    expect(isConfigCatalogPreviewEnabled(mode, 'true')).toBe(true)
  })

  it.each(['production', 'staging', 'preview'])('stays disabled in %s', (mode) => {
    expect(isConfigCatalogPreviewEnabled(mode, 'true')).toBe(false)
  })

  it.each([true, 'TRUE', '1', undefined])('rejects non-exact flags', (value) => {
    expect(isConfigCatalogPreviewEnabled('development', value)).toBe(false)
  })
})
