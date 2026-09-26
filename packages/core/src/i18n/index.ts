import { watch } from 'vue'
import { createI18n } from 'vue-i18n'

/** Shared locale selection; the application owns its messages. */
export function createRssI18n() {
  const stored = localStorage.getItem('rss-locale')
  const i18n = createI18n({
    legacy: false,
    locale: stored === 'en-US' ? 'en-US' : 'zh-CN',
    fallbackLocale: 'zh-CN',
    messages: { 'zh-CN': {}, 'en-US': {} },
    missingWarn: false,
    fallbackWarn: false,
  })
  watch(i18n.global.locale, (value) => {
    localStorage.setItem('rss-locale', value)
  })
  return i18n
}
