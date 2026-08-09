import { readonly } from 'vue'
import type { Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useThemeStore } from '../stores/useThemeStore'

type Theme = 'light' | 'dark'

/**
 * Thin composable wrapper around `useThemeStore`.
 * Returns a readonly theme ref + setTheme / toggleTheme actions.
 * The store is the single source of truth; all callers share the same state.
 */
export function useTheme(): {
  theme: Readonly<Ref<Theme>>
  setTheme: (t: Theme) => void
  toggleTheme: () => void
} {
  const store = useThemeStore()
  const { theme } = storeToRefs(store)
  return {
    theme: readonly(theme as Ref<Theme>),
    setTheme: store.setTheme,
    toggleTheme: store.toggleTheme,
  }
}
