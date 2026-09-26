import { beforeEach, describe, expect, it } from 'vitest'
import { createRssI18n } from './index'

function asComposer(i18n: ReturnType<typeof createRssI18n>) {
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

it('persists only the selected locale for the next app launch', async () => {
  const { nextTick } = await import('vue')
  localStorage.clear()
  const i18n = createRssI18n()
  asComposer(i18n).locale.value = 'en-US'
  await nextTick()
  expect(localStorage.getItem('rss-locale')).toBe('en-US')
  expect(asComposer(createRssI18n()).locale.value).toBe('en-US')
  localStorage.clear()
})
