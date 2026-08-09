import { onScopeDispose } from 'vue'
import { useThemeStore } from '@rss/core'
import { useUiStore } from '../stores/useUiStore'

/**
 * ARIA interactive widget roles that accept text input — shortcuts must be
 * suppressed when any of these roles is focused to avoid mis-triggering while
 * the user types inside AntD Select / AutoComplete / InputNumber / Slider etc.
 */
const ARIA_INPUT_ROLES = new Set(['textbox', 'searchbox', 'spinbutton', 'combobox', 'slider'])

/**
 * Returns true when the keyboard event originates from an element that
 * accepts text input. Shortcuts (except Esc) must be ignored in this case.
 *
 * Covers: native input/textarea/select, contenteditable, and ARIA interactive
 * widget roles (textbox, searchbox, spinbutton, combobox, slider) to handle
 * AntD Select and similar composite components that set role on a wrapper div.
 */
function isInputFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if ((el as HTMLElement).isContentEditable) return true
  const role = el.getAttribute('role')
  if (role !== null && ARIA_INPUT_ROLES.has(role)) return true
  return false
}

/**
 * useGlobalShortcuts — registers global keyboard shortcuts and returns a
 * cleanup function.
 *
 * When called inside a component setup() or a composable scope, cleanup is
 * registered automatically via onScopeDispose (Vue's scope lifecycle hook).
 * The returned function also allows explicit manual teardown (e.g., in tests
 * or when called outside a component scope).
 *
 * Registered shortcuts:
 *   ⌘K / Ctrl+K  → open command palette
 *   ⌘J / Ctrl+J  → toggle theme
 *   ⌘\ / Ctrl+\  → toggle sidebar
 *   Esc           → close command palette (works even when input/select focused)
 *   /             → open command palette (Batch 0 临时；PRD §5.2 原意是聚焦页内搜索)
 */
export function useGlobalShortcuts(): () => void {
  const themeStore = useThemeStore()
  const uiStore = useUiStore()

  function handleKeydown(event: KeyboardEvent): void {
    const isMod = event.metaKey || event.ctrlKey
    const key = event.key.toLowerCase()

    // Esc always works — closes command palette even when input is focused
    if (event.key === 'Escape') {
      if (uiStore.commandPaletteOpen) {
        uiStore.closeCommandPalette()
        event.preventDefault()
      }
      return
    }

    // All other shortcuts: ignore when an input/textarea/contenteditable is focused
    if (isInputFocused()) {
      return
    }

    // ⌘K / Ctrl+K → open command palette
    if (isMod && key === 'k') {
      event.preventDefault()
      uiStore.openCommandPalette()
      return
    }

    // ⌘J / Ctrl+J → toggle theme
    if (isMod && key === 'j') {
      event.preventDefault()
      themeStore.toggleTheme()
      return
    }

    // ⌘\ / Ctrl+\ → toggle sidebar
    if (isMod && key === '\\') {
      event.preventDefault()
      uiStore.toggleSidebar()
      return
    }

    // / → open command palette (search intent), no modifier
    // PRD §5.2 偏差：PRD 原意是聚焦页内搜索框；Batch 0 无页内搜索占位，临时映射到
    // 命令面板。TODO: 待各页面实现页内搜索后，改为聚焦 #page-search（PRD 对齐）。
    if (key === '/' && !isMod) {
      event.preventDefault()
      uiStore.openCommandPalette()
      return
    }
  }

  window.addEventListener('keydown', handleKeydown)

  function cleanup(): void {
    window.removeEventListener('keydown', handleKeydown)
  }

  // Auto-cleanup when the owning scope (component or effect scope) is disposed.
  // This makes the composable self-contained when used inside setup().
  onScopeDispose(cleanup)

  return cleanup
}
