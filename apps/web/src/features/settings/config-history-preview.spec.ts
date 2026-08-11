import { describe, expect, it } from 'vitest'
import { isConfigHistoryPreviewEnabled } from './config-history-preview'

describe('Config History Preview enablement', () => {
  it.each(['development', 'test', 'demo'])('accepts exact true in %s', (mode) => {
    expect(isConfigHistoryPreviewEnabled(mode, 'true')).toBe(true)
  })

  it.each(['production', 'staging', 'preview'])('stays disabled in %s', (mode) => {
    expect(isConfigHistoryPreviewEnabled(mode, 'true')).toBe(false)
  })

  it.each([true, 'TRUE', '1', undefined])('rejects non-exact flags', (value) => {
    expect(isConfigHistoryPreviewEnabled('development', value)).toBe(false)
  })
})
