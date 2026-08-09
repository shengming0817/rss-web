/**
 * useGlobalShortcuts.spec.ts — 全局快捷键测试（T021）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGlobalShortcuts } from './useGlobalShortcuts'
import { useThemeStore } from '@gocell/core'
import { useUiStore } from '../stores/useUiStore'

// Mock onScopeDispose to avoid "getCurrentInstance is null" warning in test env
vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>()
  return {
    ...actual,
    onScopeDispose: vi.fn(),
  }
})

// Mock router
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return {
    ...actual,
    useRouter: vi.fn(() => mockRouter),
  }
})

const mockPush = vi.fn().mockResolvedValue(undefined)
const mockRouter = { push: mockPush }

function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}): void {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...opts,
  })
  window.dispatchEvent(event)
}

describe('useGlobalShortcuts', () => {
  let themeStore: ReturnType<typeof useThemeStore>
  let uiStore: ReturnType<typeof useUiStore>
  let cleanup: (() => void) | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    const pinia = createPinia()
    setActivePinia(pinia)
    themeStore = useThemeStore()
    uiStore = useUiStore()
    cleanup = undefined
  })

  afterEach(() => {
    cleanup?.()
  })

  function setup(): void {
    cleanup = useGlobalShortcuts()
  }

  // ─── Theme toggle ─────────────────────────────────────────────────────────

  it('Cmd+J toggles theme', () => {
    setup()
    const spy = vi.spyOn(themeStore, 'toggleTheme')
    fireKey('j', { metaKey: true })
    expect(spy).toHaveBeenCalledOnce()
  })

  it('Ctrl+J toggles theme', () => {
    setup()
    const spy = vi.spyOn(themeStore, 'toggleTheme')
    fireKey('j', { ctrlKey: true })
    expect(spy).toHaveBeenCalledOnce()
  })

  // ─── Command palette ──────────────────────────────────────────────────────

  it('Cmd+K opens command palette', () => {
    setup()
    uiStore.commandPaletteOpen = false
    fireKey('k', { metaKey: true })
    expect(uiStore.commandPaletteOpen).toBe(true)
  })

  it('Ctrl+K opens command palette', () => {
    setup()
    uiStore.commandPaletteOpen = false
    fireKey('k', { ctrlKey: true })
    expect(uiStore.commandPaletteOpen).toBe(true)
  })

  it('Esc closes command palette when open', () => {
    setup()
    uiStore.commandPaletteOpen = true
    fireKey('Escape')
    expect(uiStore.commandPaletteOpen).toBe(false)
  })

  // ─── Sidebar toggle ───────────────────────────────────────────────────────

  it('Cmd+\\ toggles sidebar collapsed', () => {
    setup()
    const initial = uiStore.sidebarCollapsed
    fireKey('\\', { metaKey: true })
    expect(uiStore.sidebarCollapsed).toBe(!initial)
  })

  it('Ctrl+\\ toggles sidebar collapsed', () => {
    setup()
    const initial = uiStore.sidebarCollapsed
    fireKey('\\', { ctrlKey: true })
    expect(uiStore.sidebarCollapsed).toBe(!initial)
  })

  // ─── Input focus guard ────────────────────────────────────────────────────

  it('ignores Cmd+J when an input is focused', () => {
    setup()
    const spy = vi.spyOn(themeStore, 'toggleTheme')

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    fireKey('j', { metaKey: true })
    expect(spy).not.toHaveBeenCalled()

    document.body.removeChild(input)
  })

  it('ignores Cmd+K when a textarea is focused', () => {
    setup()
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    textarea.focus()

    fireKey('k', { metaKey: true })
    expect(uiStore.commandPaletteOpen).toBe(false)

    document.body.removeChild(textarea)
  })

  it('allows Esc even when input is focused (always closes palette)', () => {
    setup()
    uiStore.commandPaletteOpen = true

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    fireKey('Escape')
    expect(uiStore.commandPaletteOpen).toBe(false)

    document.body.removeChild(input)
  })

  // ─── G-prefix navigation ──────────────────────────────────────────────────

  it('G then U navigates to /access/identities', async () => {
    setup()
    fireKey('g')
    fireKey('u')
    // Allow the state-machine timeout to resolve
    await new Promise((r) => setTimeout(r, 0))
    expect(mockPush).toHaveBeenCalledWith('/access/identities')
  })

  it('G then A navigates to /audit', async () => {
    setup()
    fireKey('g')
    fireKey('a')
    await new Promise((r) => setTimeout(r, 0))
    expect(mockPush).toHaveBeenCalledWith('/audit')
  })

  it('G then C navigates to /config', async () => {
    setup()
    fireKey('g')
    fireKey('c')
    await new Promise((r) => setTimeout(r, 0))
    expect(mockPush).toHaveBeenCalledWith('/config')
  })

  it('G then F navigates to /flags', async () => {
    setup()
    fireKey('g')
    fireKey('f')
    await new Promise((r) => setTimeout(r, 0))
    expect(mockPush).toHaveBeenCalledWith('/flags')
  })

  it('G then S navigates to /coverage', async () => {
    setup()
    fireKey('g')
    fireKey('s')
    await new Promise((r) => setTimeout(r, 0))
    expect(mockPush).toHaveBeenCalledWith('/coverage')
  })

  it('G-prefix is ignored when input is focused', async () => {
    setup()
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    fireKey('g')
    fireKey('u')
    await new Promise((r) => setTimeout(r, 0))
    expect(mockPush).not.toHaveBeenCalled()

    document.body.removeChild(input)
  })

  it('G-prefix times out after 1000ms — second key no longer navigates', async () => {
    vi.useFakeTimers()
    setup()

    fireKey('g')
    // Advance past timeout
    vi.advanceTimersByTime(1001)
    fireKey('u')

    await vi.runAllTimersAsync()
    expect(mockPush).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  // ─── / key (command palette) ──────────────────────────────────────────────

  it('/ opens command palette (no modifier)', () => {
    setup()
    uiStore.commandPaletteOpen = false
    fireKey('/')
    expect(uiStore.commandPaletteOpen).toBe(true)
  })

  it('/ does not open command palette when input is focused', () => {
    setup()
    uiStore.commandPaletteOpen = false

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    fireKey('/')
    expect(uiStore.commandPaletteOpen).toBe(false)

    document.body.removeChild(input)
  })

  // ─── select focus guard ───────────────────────────────────────────────────

  it('ignores shortcuts (except Esc) when a select is focused', () => {
    setup()
    const spy = vi.spyOn(themeStore, 'toggleTheme')

    const select = document.createElement('select')
    document.body.appendChild(select)
    select.focus()

    fireKey('j', { metaKey: true })
    expect(spy).not.toHaveBeenCalled()

    document.body.removeChild(select)
  })

  it('Esc still works when select is focused (closes palette)', () => {
    setup()
    uiStore.commandPaletteOpen = true

    const select = document.createElement('select')
    document.body.appendChild(select)
    select.focus()

    fireKey('Escape')
    expect(uiStore.commandPaletteOpen).toBe(false)

    document.body.removeChild(select)
  })

  // ─── ARIA role input guard (AntD Select / combobox) ───────────────────────

  it('ignores shortcuts when role="combobox" element is focused (AntD Select)', () => {
    setup()
    const spy = vi.spyOn(themeStore, 'toggleTheme')

    const div = document.createElement('div')
    div.setAttribute('role', 'combobox')
    div.setAttribute('tabindex', '0')
    document.body.appendChild(div)
    div.focus()

    fireKey('j', { metaKey: true })
    expect(spy).not.toHaveBeenCalled()

    document.body.removeChild(div)
  })

  it('ignores shortcuts when role="textbox" element is focused', () => {
    setup()
    const spy = vi.spyOn(themeStore, 'toggleTheme')

    const div = document.createElement('div')
    div.setAttribute('role', 'textbox')
    div.setAttribute('tabindex', '0')
    document.body.appendChild(div)
    div.focus()

    fireKey('j', { metaKey: true })
    expect(spy).not.toHaveBeenCalled()

    document.body.removeChild(div)
  })

  it('ignores shortcuts when role="searchbox" element is focused', () => {
    setup()
    uiStore.commandPaletteOpen = false
    const div = document.createElement('div')
    div.setAttribute('role', 'searchbox')
    div.setAttribute('tabindex', '0')
    document.body.appendChild(div)
    div.focus()

    fireKey('k', { metaKey: true })
    expect(uiStore.commandPaletteOpen).toBe(false)

    document.body.removeChild(div)
  })

  it('Esc still works when role="combobox" element is focused (closes palette)', () => {
    setup()
    uiStore.commandPaletteOpen = true

    const div = document.createElement('div')
    div.setAttribute('role', 'combobox')
    div.setAttribute('tabindex', '0')
    document.body.appendChild(div)
    div.focus()

    fireKey('Escape')
    expect(uiStore.commandPaletteOpen).toBe(false)

    document.body.removeChild(div)
  })

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  it('cleans up listeners when cleanup is called', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
    setup()
    cleanup!()
    cleanup = undefined
    expect(removeEventListenerSpy).toHaveBeenCalled()
  })
})
