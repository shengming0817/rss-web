import { beforeEach, describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createRssI18n } from './index'
import zhCN from './messages/zh-CN'
import enUS from './messages/en-US'

function asComposer(i18n: ReturnType<typeof createI18n>) {
  return i18n.global as { locale: { value: string }; t: (key: string) => string }
}

function leafKeys(value: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return child !== null && typeof child === 'object'
      ? leafKeys(child as Record<string, unknown>, path)
      : [path]
  })
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

  it('keeps both locale schemas identical', () => {
    expect(leafKeys(enUS).sort()).toEqual(leafKeys(zhCN).sort())
  })

  it('contains only reusable shell and foundation namespaces', () => {
    expect(Object.keys(zhCN).sort()).toEqual([
      'command',
      'contentState',
      'errorPage',
      'errors',
      'home',
      'shell',
      'source',
    ])
  })

  it('contains every API transport message in both locales', () => {
    const keys = [
      'unknown',
      'network',
      'validation',
      'invalidResponse',
      'invalidRequest',
      'requestAborted',
      'requestTimeout',
    ] as const
    for (const key of keys) {
      expect(enUS.errors[key]).not.toBe(`errors.${key}`)
      expect(zhCN.errors[key]).not.toBe(`errors.${key}`)
    }
  })
})
