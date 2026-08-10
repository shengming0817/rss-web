import { createRssI18n } from '@rss/core'
import enUS from './messages/en-US'
import zhCN from './messages/zh-CN'

export function createWebI18n() {
  const i18n = createRssI18n()
  const composer = i18n.global as unknown as {
    mergeLocaleMessage(locale: string, message: Record<string, unknown>): void
  }
  composer.mergeLocaleMessage('zh-CN', zhCN)
  composer.mergeLocaleMessage('en-US', enUS)
  return i18n
}
