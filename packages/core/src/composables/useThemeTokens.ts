import type { ComputedRef } from 'vue'
import { storeToRefs } from 'pinia'
import { useThemeStore } from '../stores/useThemeStore'
import type { ThemeConfig } from '../stores/useThemeStore'

export type { ThemeConfig }

/**
 * Thin composable wrapper that exposes the AntD ThemeConfig computed from
 * `useThemeStore`. The computed lives in the store so all callers share a
 * single reactive instance without a module-level singleton.
 */
export function useThemeTokens(): { themeConfig: ComputedRef<ThemeConfig> } {
  const store = useThemeStore()
  const { themeConfig } = storeToRefs(store)
  return { themeConfig: themeConfig as ComputedRef<ThemeConfig> }
}
