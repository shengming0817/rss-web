import { createI18n } from 'vue-i18n'

/** Shared locale selection; the application owns its messages. */
export function createRssI18n(): ReturnType<typeof createI18n> {
  const stored = localStorage.getItem('rss-locale')
  return createI18n({
    legacy: false,
    locale: stored === 'en-US' ? 'en-US' : 'zh-CN',
    fallbackLocale: 'zh-CN',
    messages: { 'zh-CN': {}, 'en-US': {} },
    missingWarn: false,
    fallbackWarn: false,
  })
}
