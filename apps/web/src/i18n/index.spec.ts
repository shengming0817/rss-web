import { describe, expect, it } from 'vitest'
import enUS from './messages/en-US'
import zhCN from './messages/zh-CN'
import { createWebI18n } from './index'

function leafKeys(value: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return child !== null && typeof child === 'object'
      ? leafKeys(child as Record<string, unknown>, path)
      : [path]
  })
}

describe('Web Identity messages', () => {
  it('keeps Chinese and English schemas identical', () => {
    expect(leafKeys(enUS).sort()).toEqual(leafKeys(zhCN).sort())
  })

  it('merges app messages without replacing reusable shell messages', () => {
    const i18n = createWebI18n()
    const composer = i18n.global as unknown as { t(key: string): string }
    expect(composer.t('identity.login.title')).toBe('登录')
    expect(composer.t('shell.brand')).toBe('RSS Web')
  })
})
