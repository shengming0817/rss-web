/**
 * useUiStore.spec.ts — UI state store tests
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUiStore } from './useUiStore'

describe('useUiStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts with commandPaletteOpen=false', () => {
    const store = useUiStore()
    expect(store.commandPaletteOpen).toBe(false)
  })

  it('starts with sidebarCollapsed=false', () => {
    const store = useUiStore()
    expect(store.sidebarCollapsed).toBe(false)
  })

  it('openCommandPalette sets commandPaletteOpen to true', () => {
    const store = useUiStore()
    store.openCommandPalette()
    expect(store.commandPaletteOpen).toBe(true)
  })

  it('closeCommandPalette sets commandPaletteOpen to false', () => {
    const store = useUiStore()
    store.commandPaletteOpen = true
    store.closeCommandPalette()
    expect(store.commandPaletteOpen).toBe(false)
  })

  it('toggleSidebar flips sidebarCollapsed', () => {
    const store = useUiStore()
    expect(store.sidebarCollapsed).toBe(false)
    store.toggleSidebar()
    expect(store.sidebarCollapsed).toBe(true)
    store.toggleSidebar()
    expect(store.sidebarCollapsed).toBe(false)
  })
})
