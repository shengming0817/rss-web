import { createI18n } from 'vue-i18n'
import zhCN from './messages/zh-CN'
import enUS from './messages/en-US'
import type { MessageSchema } from './messages/zh-CN'
import type { AppLocale } from '../stores/useLocaleStore'

export type { MessageSchema }
export type { AppLocale }

/**
 * createGocellI18n — vue-i18n 11 factory for the gocell web app.
 *
 * - Composition API mode (legacy: false)
 * - Initial locale read from localStorage (which the locale store also uses)
 * - Fallback locale: zh-CN
 * - Messages bundled at build time (framework keys only; business keys added per batch)
 * - missingWarn / fallbackWarn: false (silent). `@gocell/core` has no vite/client types,
 *   so `import.meta.env.DEV` is not available here. If per-env warn toggling is needed,
 *   pass options from `apps/web/main.ts` where vite types are in scope.
 *
 * Locale sync is handled by App.vue's watch on useLocaleStore.
 */
export function createGocellI18n(): ReturnType<typeof createI18n> {
  const STORAGE_KEY = 'gocell-locale'
  const stored = localStorage.getItem(STORAGE_KEY)
  const initialLocale: AppLocale = stored === 'zh-CN' || stored === 'en-US' ? stored : 'zh-CN'

  const messages: Record<AppLocale, MessageSchema> = {
    'zh-CN': zhCN,
    'en-US': enUS,
  }

  return createI18n({
    legacy: false,
    locale: initialLocale,
    fallbackLocale: 'zh-CN',
    messages,
    // Keeping warn flags false: @gocell/core lacks vite/client types so
    // import.meta.env.DEV is not resolvable here. Silent in all envs for now.
    missingWarn: false,
    fallbackWarn: false,
  })
}
