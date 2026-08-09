import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLocaleStore } from './useLocaleStore'

const STORAGE_KEY = 'gocell-locale'

describe('useLocaleStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('defaults to zh-CN when localStorage is empty', () => {
    const store = useLocaleStore()
    expect(store.locale).toBe('zh-CN')
  })

  it('reads initial locale from localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'en-US')
    const store = useLocaleStore()
    expect(store.locale).toBe('en-US')
  })

  it('falls back to zh-CN for invalid stored value', () => {
    localStorage.setItem(STORAGE_KEY, 'invalid-locale')
    const store = useLocaleStore()
    expect(store.locale).toBe('zh-CN')
  })

  it('setLocale updates locale state', () => {
    const store = useLocaleStore()
    store.setLocale('en-US')
    expect(store.locale).toBe('en-US')
  })

  it('setLocale persists to localStorage', () => {
    const store = useLocaleStore()
    store.setLocale('en-US')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('en-US')
  })

  it('setLocale back to zh-CN persists correctly', () => {
    const store = useLocaleStore()
    store.setLocale('en-US')
    store.setLocale('zh-CN')
    expect(store.locale).toBe('zh-CN')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('zh-CN')
  })

  it('setLocale ignores invalid value (type-guard)', () => {
    const store = useLocaleStore()
    // Cast to bypass TS to test runtime guard
    ;(store.setLocale as (v: unknown) => void)('fr-FR')
    expect(store.locale).toBe('zh-CN')
  })

  it('store id is core.locale', () => {
    const store = useLocaleStore()
    expect(store.$id).toBe('core.locale')
  })
})
