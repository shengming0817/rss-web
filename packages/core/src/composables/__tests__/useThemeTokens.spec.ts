import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { theme as themeAlgorithm } from 'ant-design-vue'
import { useThemeTokens } from '../useThemeTokens'
import { useTheme } from '../useTheme'

// Helper: mock getComputedStyle to return fixed values for CSS variables
const setupGetComputedStyle = (vars: Record<string, string>) => {
  const original = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) => {
    const realStyle = original(el, pseudo ?? undefined)
    return new Proxy(realStyle, {
      get(target, prop) {
        if (prop === 'getPropertyValue') {
          return (name: string) => vars[name.trim()] ?? ''
        }
        const val = Reflect.get(target, prop)
        if (typeof val === 'function') return (val as (...args: unknown[]) => unknown).bind(target)
        return val
      },
    })
  })
}

describe('useThemeTokens', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    document.documentElement.removeAttribute('data-theme')
    localStorage.clear()
    // Fresh Pinia instance before each test so store state is clean
    setActivePinia(createPinia())
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  describe('token mapping', () => {
    it('maps CSS variables to AntD seed tokens correctly', () => {
      setupGetComputedStyle({
        '--accent': 'rgb(59, 130, 246)',
        '--ok': 'rgb(34, 197, 94)',
        '--warn': 'rgb(234, 179, 8)',
        '--err': 'rgb(239, 68, 68)',
        '--bg': 'rgb(254, 254, 255)',
        '--bg-raised': 'rgb(255, 255, 255)',
        '--fg': 'rgb(15, 15, 20)',
        '--line': 'rgb(230, 232, 240)',
        '--font-sans': '"Geist", system-ui',
        '--r': '6px',
      })

      const { themeConfig } = useThemeTokens()

      expect(themeConfig.value.token?.colorPrimary).toContain('rgb')
      expect(themeConfig.value.token?.colorSuccess).toContain('rgb')
      expect(themeConfig.value.token?.colorWarning).toContain('rgb')
      expect(themeConfig.value.token?.colorError).toContain('rgb')
      expect(themeConfig.value.token?.borderRadius).toBe(6)
    })

    it('sets colorPrimary from --accent', () => {
      setupGetComputedStyle({
        '--accent': 'rgb(59, 130, 246)',
        '--ok': 'rgb(34, 197, 94)',
        '--warn': 'rgb(234, 179, 8)',
        '--err': 'rgb(239, 68, 68)',
        '--bg': 'rgb(254, 254, 255)',
        '--bg-raised': 'rgb(255, 255, 255)',
        '--fg': 'rgb(15, 15, 20)',
        '--line': 'rgb(230, 232, 240)',
        '--font-sans': '"Geist", system-ui',
        '--r': '6px',
      })

      const { themeConfig } = useThemeTokens()

      expect(themeConfig.value.token?.colorPrimary).toBe('rgb(59, 130, 246)')
    })

    it('reads borderRadius from --r CSS variable', () => {
      setupGetComputedStyle({
        '--accent': 'rgb(0, 0, 255)',
        '--ok': 'rgb(0, 255, 0)',
        '--warn': 'rgb(255, 165, 0)',
        '--err': 'rgb(255, 0, 0)',
        '--bg': 'rgb(255, 255, 255)',
        '--bg-raised': 'rgb(255, 255, 255)',
        '--fg': 'rgb(0, 0, 0)',
        '--line': 'rgb(200, 200, 200)',
        '--font-sans': 'sans-serif',
        '--r': '6px',
      })

      const { themeConfig } = useThemeTokens()
      expect(themeConfig.value.token?.borderRadius).toBe(6)
    })

    it('falls back to borderRadius 6 when --r is absent', () => {
      // No --r provided — should fallback to 6
      setupGetComputedStyle({
        '--accent': 'rgb(0, 0, 255)',
        '--fg': 'rgb(0, 0, 0)',
      })

      const { themeConfig } = useThemeTokens()
      expect(themeConfig.value.token?.borderRadius).toBe(6)
    })

    it('returns undefined for missing CSS variables so AntD ignores them', () => {
      // No CSS vars provided — all should be undefined (not empty string)
      setupGetComputedStyle({})

      const { themeConfig } = useThemeTokens()

      expect(themeConfig.value.token?.colorPrimary).toBeUndefined()
      expect(themeConfig.value.token?.colorBgBase).toBeUndefined()
    })
  })

  describe('algorithm switching', () => {
    it('uses defaultAlgorithm for light theme', () => {
      localStorage.setItem('gocell-theme', 'light')

      setupGetComputedStyle({
        '--accent': 'rgb(59, 130, 246)',
        '--ok': 'rgb(34, 197, 94)',
        '--warn': 'rgb(234, 179, 8)',
        '--err': 'rgb(239, 68, 68)',
        '--bg': 'rgb(254, 254, 255)',
        '--bg-raised': 'rgb(255, 255, 255)',
        '--fg': 'rgb(15, 15, 20)',
        '--line': 'rgb(230, 232, 240)',
        '--font-sans': '"Geist", system-ui',
        '--r': '6px',
      })

      const { themeConfig } = useThemeTokens()

      expect(themeConfig.value.algorithm).toBe(themeAlgorithm.defaultAlgorithm)
    })

    it('uses darkAlgorithm for dark theme', () => {
      localStorage.setItem('gocell-theme', 'dark')

      setupGetComputedStyle({
        '--accent': 'rgb(100, 160, 255)',
        '--ok': 'rgb(34, 197, 94)',
        '--warn': 'rgb(234, 179, 8)',
        '--err': 'rgb(239, 68, 68)',
        '--bg': 'rgb(20, 20, 30)',
        '--bg-raised': 'rgb(30, 30, 40)',
        '--fg': 'rgb(240, 240, 245)',
        '--line': 'rgb(60, 62, 80)',
        '--font-sans': '"Geist", system-ui',
        '--r': '6px',
      })

      const { themeConfig } = useThemeTokens()

      expect(themeConfig.value.algorithm).toBe(themeAlgorithm.darkAlgorithm)
    })

    it('switches algorithm when theme changes', () => {
      localStorage.setItem('gocell-theme', 'light')

      setupGetComputedStyle({
        '--accent': 'rgb(59, 130, 246)',
        '--ok': 'rgb(34, 197, 94)',
        '--warn': 'rgb(234, 179, 8)',
        '--err': 'rgb(239, 68, 68)',
        '--bg': 'rgb(254, 254, 255)',
        '--bg-raised': 'rgb(255, 255, 255)',
        '--fg': 'rgb(15, 15, 20)',
        '--line': 'rgb(230, 232, 240)',
        '--font-sans': '"Geist", system-ui',
        '--r': '6px',
      })

      const { themeConfig } = useThemeTokens()
      const { setTheme } = useTheme()

      expect(themeConfig.value.algorithm).toBe(themeAlgorithm.defaultAlgorithm)

      setTheme('dark')

      expect(themeConfig.value.algorithm).toBe(themeAlgorithm.darkAlgorithm)
    })

    it('CSS token values update when switching from light to dark', () => {
      localStorage.setItem('gocell-theme', 'light')

      // Light mode CSS vars
      setupGetComputedStyle({
        '--accent': 'rgb(59, 130, 246)',
        '--ok': 'rgb(34, 197, 94)',
        '--warn': 'rgb(234, 179, 8)',
        '--err': 'rgb(239, 68, 68)',
        '--bg': 'rgb(254, 254, 255)',
        '--fg': 'rgb(15, 15, 20)',
        '--line': 'rgb(230, 232, 240)',
        '--font-sans': '"Geist", system-ui',
        '--r': '6px',
      })

      const { themeConfig } = useThemeTokens()
      const { setTheme } = useTheme()

      const lightPrimary = themeConfig.value.token?.colorPrimary
      const lightBg = themeConfig.value.token?.colorBgBase

      // Switch to dark: update getComputedStyle mock to return dark values
      setupGetComputedStyle({
        '--accent': 'rgb(100, 160, 255)',
        '--ok': 'rgb(34, 197, 94)',
        '--warn': 'rgb(234, 179, 8)',
        '--err': 'rgb(239, 68, 68)',
        '--bg': 'rgb(20, 20, 30)',
        '--fg': 'rgb(240, 240, 245)',
        '--line': 'rgb(60, 62, 80)',
        '--font-sans': '"Geist", system-ui',
        '--r': '6px',
      })

      setTheme('dark')

      const darkPrimary = themeConfig.value.token?.colorPrimary
      const darkBg = themeConfig.value.token?.colorBgBase

      // colorPrimary should have changed (different accent in dark mode)
      expect(darkPrimary).not.toBe(lightPrimary)
      // colorBgBase should have changed (different bg in dark mode)
      expect(darkBg).not.toBe(lightBg)
    })
  })

  describe('shared singleton via store', () => {
    it('themeConfig value is consistent across multiple calls (Pinia store is the singleton)', () => {
      setupGetComputedStyle({
        '--accent': 'rgb(59, 130, 246)',
        '--ok': 'rgb(34, 197, 94)',
        '--warn': 'rgb(234, 179, 8)',
        '--err': 'rgb(239, 68, 68)',
        '--bg': 'rgb(254, 254, 255)',
        '--bg-raised': 'rgb(255, 255, 255)',
        '--fg': 'rgb(15, 15, 20)',
        '--line': 'rgb(230, 232, 240)',
        '--font-sans': '"Geist", system-ui',
        '--r': '6px',
      })

      const a = useThemeTokens()
      const b = useThemeTokens()
      // Both read from the same Pinia store computed — values are equal
      expect(a.themeConfig.value).toEqual(b.themeConfig.value)
      // A theme change via store is reflected in both refs
      const { setTheme } = useTheme()
      setTheme('dark')
      expect(a.themeConfig.value.algorithm).toBe(b.themeConfig.value.algorithm)
    })
  })
})
