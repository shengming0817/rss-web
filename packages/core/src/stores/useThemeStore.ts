import { computed, onScopeDispose, ref } from 'vue'
import { defineStore } from 'pinia'
import { theme as antTheme } from 'ant-design-vue'
import type { ConfigProviderProps } from 'ant-design-vue'

type Theme = 'light' | 'dark'

/**
 * ThemeConfig derived from AntD's publicly exported ConfigProviderProps.
 * This avoids importing from internal AntD paths (es/config-provider/context).
 */
export type ThemeConfig = NonNullable<ConfigProviderProps['theme']>

/**
 * Read a single CSS variable from :root.
 * Returns undefined when the variable is missing (empty string from getPropertyValue)
 * so AntD ignores the field rather than receiving an empty string.
 */
function readCssVar(style: CSSStyleDeclaration, name: string): string | undefined {
  const value = style.getPropertyValue(name).trim()
  return value !== '' ? value : undefined
}

/**
 * Build the partial seed token override by reading CSS variables once.
 * Accepts the current theme string so the computed ref invalidates on theme change.
 */
function buildSeedTokens(currentTheme: 'light' | 'dark'): ThemeConfig['token'] {
  // currentTheme consumed to ensure computed recalculates on switch
  void currentTheme

  // Single getComputedStyle call → one style-flush for all variables
  const style = window.getComputedStyle(document.documentElement)

  const accent = readCssVar(style, '--accent')
  const ok = readCssVar(style, '--ok')
  const warn = readCssVar(style, '--warn')
  const err = readCssVar(style, '--err')
  const bg = readCssVar(style, '--bg')
  const fg = readCssVar(style, '--fg')
  const line = readCssVar(style, '--line')
  const fontSans = readCssVar(style, '--font-sans')

  // Read --r (e.g. "6px") and parse to number; fallback 6 when variable is absent
  const rRaw = readCssVar(style, '--r')
  const borderRadius = rRaw !== undefined ? Number.parseInt(rRaw, 10) : 6

  return {
    borderRadius,
    ...(accent !== undefined && { colorPrimary: accent }),
    ...(ok !== undefined && { colorSuccess: ok }),
    ...(warn !== undefined && { colorWarning: warn }),
    ...(err !== undefined && { colorError: err }),
    ...(bg !== undefined && { colorBgBase: bg }),
    ...(fg !== undefined && { colorTextBase: fg }),
    ...(line !== undefined && { colorBorder: line }),
    ...(fontSans !== undefined && { fontFamily: fontSans }),
  }
}

const STORAGE_KEY = 'gocell-theme'

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

/**
 * Read initial theme from the inline FOUC barrier script (which already wrote
 * dataset.theme before JS loaded) so we don't re-derive and cause a second
 * paint flip.
 */
function readInitialTheme(): Theme {
  // 1. Prefer whatever the FOUC barrier already applied to <html data-theme>
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

  // Apply on init in case the store is created after the FOUC barrier
  // (the barrier already wrote it, so this is a no-op write of the same value)
  applyTheme(theme.value)

  // Derived AntD ThemeConfig — lives here so all callers share one computed
  // without a module-level singleton.
  const themeConfig = computed<ThemeConfig>(
    () =>
      ({
        algorithm: theme.value === 'dark' ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
        token: buildSeedTokens(theme.value),
      }) as ThemeConfig,
  )

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

  return { theme, themeConfig, setTheme, toggleTheme }
})
