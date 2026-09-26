import { beforeEach, describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createRssI18n } from './index'

function asComposer(i18n: ReturnType<typeof createI18n>) {
  return i18n.global as { locale: { value: string }; t: (key: string) => string }
}

describe('createRssI18n', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to zh-CN and accepts a persisted supported locale', () => {
    expect(asComposer(createRssI18n()).locale.value).toBe('zh-CN')
    localStorage.setItem('rss-locale', 'en-US')
    expect(asComposer(createRssI18n()).locale.value).toBe('en-US')
  })

  it('rejects unsupported persisted locales', () => {
    localStorage.setItem('rss-locale', 'de-DE')
    expect(asComposer(createRssI18n()).locale.value).toBe('zh-CN')
  })
})
