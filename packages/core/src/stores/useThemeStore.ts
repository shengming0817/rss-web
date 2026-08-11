import { onScopeDispose, ref } from 'vue'
import { defineStore } from 'pinia'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'rss-theme'

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

/**
 * Resolve the initial native theme without relying on an inline boot script.
 */
function readInitialTheme(): Theme {
  // 1. Prefer a theme already applied by the current application lifetime.
  const applied = document.documentElement.dataset['theme']
  if (isTheme(applied)) return applied

  // 2. localStorage fallback (should align with FOUC barrier logic)
  const stored = localStorage.getItem(STORAGE_KEY)
  if (isTheme(stored)) return stored

  // 3. matchMedia
  if (typeof window.matchMedia === 'function') {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  }

  return 'light'
}

function applyTheme(t: Theme): void {
  document.documentElement.dataset['theme'] = t
  localStorage.setItem(STORAGE_KEY, t)
}

export const useThemeStore = defineStore('core.theme', () => {
  const theme = ref<Theme>(readInitialTheme())

  // Apply before the root component mounts.
  applyTheme(theme.value)

  // Register OS-level change listener only when user has NOT made an explicit
  // localStorage choice. Flag prevents duplicate registration across HMR.
  let _mediaListenerRegistered = false

  function _registerSystemListener(): void {
    if (_mediaListenerRegistered) return
    if (typeof window.matchMedia !== 'function') return
    _mediaListenerRegistered = true
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      // Only follow system if user has no stored preference
      if (!localStorage.getItem(STORAGE_KEY)) {
        setTheme(e.matches ? 'dark' : 'light')
      }
    }
    mq.addEventListener('change', handler)
    onScopeDispose(() => {
      mq.removeEventListener('change', handler)
    })
  }

  function setTheme(t: Theme): void {
    theme.value = t
    applyTheme(t)
  }

  function toggleTheme(): void {
    setTheme(theme.value === 'light' ? 'dark' : 'light')
  }

  // Register listener after store is set up
  _registerSystemListener()

  return { theme, setTheme, toggleTheme }
})
