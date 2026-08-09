import { beforeEach, describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createGocellI18n } from './index'
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

describe('createGocellI18n', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to zh-CN and accepts a persisted supported locale', () => {
    expect(asComposer(createGocellI18n()).locale.value).toBe('zh-CN')
    localStorage.setItem('gocell-locale', 'en-US')
    expect(asComposer(createGocellI18n()).locale.value).toBe('en-US')
  })

  it('rejects unsupported persisted locales', () => {
    localStorage.setItem('gocell-locale', 'de-DE')
    expect(asComposer(createGocellI18n()).locale.value).toBe('zh-CN')
  })

  it('keeps both locale schemas identical', () => {
    expect(leafKeys(enUS).sort()).toEqual(leafKeys(zhCN).sort())
  })

  it('contains only reusable shell and foundation namespaces', () => {
    expect(Object.keys(zhCN).sort()).toEqual(['command', 'errors', 'home', 'shell'])
  })
})
