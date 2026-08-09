import { onScopeDispose } from 'vue'
import { useRouter } from 'vue-router'
import { useThemeStore } from '@gocell/core'
import { useUiStore } from '../stores/useUiStore'

/**
 * G-prefix navigation map: second key → route path.
 * Sequence: press G then one of these keys within G_TIMEOUT_MS.
 *
 * PRD §5.2 偏差说明：
 *  - G→S 映射 /coverage（PRD 写 Settings，Batch 0 无 /settings 路由）。
 *    TODO: Batch 7+ 补 /settings 路由后改回 PRD 原意。
 */
const G_NAV: Record<string, string> = {
  u: '/access/identities',
  a: '/audit',
  c: '/config',
  f: '/flags',
  s: '/coverage', // Batch 0 临时映射 Coverage；PRD §5.2 原意是 Settings，待 Batch 7+ 对齐
}

/** How long to wait for the second key after G press (ms). */
const G_TIMEOUT_MS = 1000

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
 *   G then U      → /access/identities
 *   G then A      → /audit
 *   G then C      → /config
 *   G then F      → /flags
 *   G then S      → /coverage (Batch 0 临时；PRD §5.2 原意是 Settings)
 */
export function useGlobalShortcuts(): () => void {
  const router = useRouter()
  const themeStore = useThemeStore()
  const uiStore = useUiStore()

  let gPrefixActive = false
  let gPrefixTimer: ReturnType<typeof setTimeout> | null = null

  function clearGPrefix(): void {
    gPrefixActive = false
    if (gPrefixTimer !== null) {
      clearTimeout(gPrefixTimer)
      gPrefixTimer = null
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    const isMod = event.metaKey || event.ctrlKey
    const key = event.key.toLowerCase()

    // Esc always works — closes command palette even when input is focused
    if (event.key === 'Escape') {
      if (uiStore.commandPaletteOpen) {
        uiStore.closeCommandPalette()
        event.preventDefault()
      }
      clearGPrefix()
      return
    }

    // All other shortcuts: ignore when an input/textarea/contenteditable is focused
    if (isInputFocused()) {
      clearGPrefix()
      return
    }

    // ⌘K / Ctrl+K → open command palette
    if (isMod && key === 'k') {
      event.preventDefault()
      uiStore.openCommandPalette()
      clearGPrefix()
      return
    }

    // ⌘J / Ctrl+J → toggle theme
    if (isMod && key === 'j') {
      event.preventDefault()
      themeStore.toggleTheme()
      clearGPrefix()
      return
    }

    // ⌘\ / Ctrl+\ → toggle sidebar
    if (isMod && key === '\\') {
      event.preventDefault()
      uiStore.toggleSidebar()
      clearGPrefix()
      return
    }

    // / → open command palette (search intent), no modifier
    // PRD §5.2 偏差：PRD 原意是聚焦页内搜索框；Batch 0 无页内搜索占位，临时映射到
    // 命令面板。TODO: 待各页面实现页内搜索后，改为聚焦 #page-search（PRD 对齐）。
    if (key === '/' && !isMod) {
      event.preventDefault()
      uiStore.openCommandPalette()
      clearGPrefix()
      return
    }

    // G-prefix navigation state machine (no modifier)
    if (!isMod) {
      if (gPrefixActive) {
        // Second key of G-sequence
        const dest = G_NAV[key]
        clearGPrefix()
        if (dest) {
          event.preventDefault()
          router.push(dest).catch(() => {
            // Navigation failures are silently swallowed
          })
        }
        return
      }

      if (key === 'g') {
        // Begin G-prefix sequence
        gPrefixActive = true
        gPrefixTimer = setTimeout(clearGPrefix, G_TIMEOUT_MS)
        return
      }
    }
  }

  window.addEventListener('keydown', handleKeydown)

  function cleanup(): void {
    window.removeEventListener('keydown', handleKeydown)
    clearGPrefix()
  }

  // Auto-cleanup when the owning scope (component or effect scope) is disposed.
  // This makes the composable self-contained when used inside setup().
  onScopeDispose(cleanup)

  return cleanup
}
