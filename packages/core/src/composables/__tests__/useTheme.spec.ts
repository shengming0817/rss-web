import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mockMatchMedia = (prefersDark: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)' ? prefersDark : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

const mockMatchMediaUnsupported = () => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: undefined,
  })
}

describe('useTheme', () => {
  beforeEach(() => {
    // Reset DOM
    document.documentElement.removeAttribute('data-theme')
    // Reset localStorage
    localStorage.clear()
    // Reset matchMedia mock to default (light)
    mockMatchMedia(false)
    // Fresh Pinia + fresh module cache for each test
    setActivePinia(createPinia())
    vi.resetModules()
  })

  describe('initial theme resolution', () => {
    it('reads theme from localStorage when set to light', async () => {
      localStorage.setItem('gocell-theme', 'light')
      const mod = await import('../useTheme')
      const { theme } = mod.useTheme()
      expect(theme.value).toBe('light')
      expect(document.documentElement.dataset['theme']).toBe('light')
    })

    it('reads theme from localStorage when set to dark', async () => {
      localStorage.setItem('gocell-theme', 'dark')
      const mod = await import('../useTheme')
      const { theme } = mod.useTheme()
      expect(theme.value).toBe('dark')
      expect(document.documentElement.dataset['theme']).toBe('dark')
    })

    it('falls back to matchMedia when localStorage is empty', async () => {
      mockMatchMedia(true)
      const mod = await import('../useTheme')
      const { theme } = mod.useTheme()
      expect(theme.value).toBe('dark')
      expect(document.documentElement.dataset['theme']).toBe('dark')
    })

    it('falls back to light when localStorage is empty and matchMedia prefers light', async () => {
      mockMatchMedia(false)
      const mod = await import('../useTheme')
      const { theme } = mod.useTheme()
      expect(theme.value).toBe('light')
      expect(document.documentElement.dataset['theme']).toBe('light')
    })

    it('falls back to light when matchMedia is unsupported', async () => {
      mockMatchMediaUnsupported()
      const mod = await import('../useTheme')
      const { theme } = mod.useTheme()
      expect(theme.value).toBe('light')
    })

    it('ignores invalid localStorage value and falls back to matchMedia', async () => {
      localStorage.setItem('gocell-theme', 'invalid-value')
      mockMatchMedia(true)
      const mod = await import('../useTheme')
      const { theme } = mod.useTheme()
      expect(theme.value).toBe('dark')
    })
  })

  describe('setTheme', () => {
    it('updates document.documentElement data-theme attribute', async () => {
      const mod = await import('../useTheme')
      const { setTheme } = mod.useTheme()
      setTheme('dark')
      expect(document.documentElement.dataset['theme']).toBe('dark')
    })

    it('updates localStorage', async () => {
      const mod = await import('../useTheme')
      const { setTheme } = mod.useTheme()
      setTheme('dark')
      expect(localStorage.getItem('gocell-theme')).toBe('dark')
    })

    it('updates the theme ref', async () => {
      const mod = await import('../useTheme')
      const { theme, setTheme } = mod.useTheme()
      setTheme('dark')
      expect(theme.value).toBe('dark')
    })

    it('can switch from dark back to light', async () => {
      localStorage.setItem('gocell-theme', 'dark')
      const mod = await import('../useTheme')
      const { theme, setTheme } = mod.useTheme()
      expect(theme.value).toBe('dark')
      setTheme('light')
      expect(theme.value).toBe('light')
      expect(document.documentElement.dataset['theme']).toBe('light')
      expect(localStorage.getItem('gocell-theme')).toBe('light')
    })
  })

  describe('toggleTheme', () => {
    it('toggles from light to dark', async () => {
      localStorage.setItem('gocell-theme', 'light')
      const mod = await import('../useTheme')
      const { theme, toggleTheme } = mod.useTheme()
      toggleTheme()
      expect(theme.value).toBe('dark')
      expect(document.documentElement.dataset['theme']).toBe('dark')
      expect(localStorage.getItem('gocell-theme')).toBe('dark')
    })

    it('toggles from dark to light', async () => {
      localStorage.setItem('gocell-theme', 'dark')
      const mod = await import('../useTheme')
      const { theme, toggleTheme } = mod.useTheme()
      toggleTheme()
      expect(theme.value).toBe('light')
      expect(document.documentElement.dataset['theme']).toBe('light')
    })

    it('multiple toggles work correctly', async () => {
      const mod = await import('../useTheme')
      const { theme, toggleTheme } = mod.useTheme()
      const initial = theme.value
      toggleTheme()
      expect(theme.value).not.toBe(initial)
      toggleTheme()
      expect(theme.value).toBe(initial)
    })
  })

  describe('shared singleton via store', () => {
    it('theme value is the same across multiple calls', async () => {
      const mod = await import('../useTheme')
      const a = mod.useTheme()
      const b = mod.useTheme()
      // Both refs point to the same Pinia store state
      expect(a.theme.value).toBe(b.theme.value)
    })

    it('setTheme in one call is reflected in another', async () => {
      const mod = await import('../useTheme')
      const a = mod.useTheme()
      const b = mod.useTheme()
      a.setTheme('dark')
      expect(b.theme.value).toBe('dark')
    })
  })
})
