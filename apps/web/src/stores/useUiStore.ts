import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * useUiStore — global UI state for apps/web layout shell.
 *
 * Owns commandPaletteOpen / sidebarCollapsed and the access-denied notice so that:
 *  - AppShell can v-model bind them (additive props)
 *  - useGlobalShortcuts can read/write them without prop-drilling
 *  - the route guard (registerGuards' onAccessDenied) can surface a PDP deny reason
 *    that AppShellLayout renders into an aria-live region (decoupled from the guard)
 */
export const useUiStore = defineStore('web.ui', () => {
  const commandPaletteOpen = ref(false)
  const sidebarCollapsed = ref(false)
  // PDP deny reasonCode pending announcement; null = nothing to announce.
  const accessDeniedReasonCode = ref<string | null>(null)
  const accessDeniedNoticeSeq = ref(0)

  function openCommandPalette(): void {
    commandPaletteOpen.value = true
  }

  function closeCommandPalette(): void {
    commandPaletteOpen.value = false
  }

  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  /** Surface a PDP deny reason (Decision.reasonCode) for the live-region notice. */
  function notifyAccessDenied(reasonCode: string): void {
    accessDeniedReasonCode.value = reasonCode
    accessDeniedNoticeSeq.value += 1
  }

  /** Clear the access-denied notice (after it has been announced / dismissed). */
  function clearAccessDenied(): void {
    accessDeniedReasonCode.value = null
  }

  return {
    commandPaletteOpen,
    sidebarCollapsed,
    accessDeniedReasonCode,
    accessDeniedNoticeSeq,
    openCommandPalette,
    closeCommandPalette,
    toggleSidebar,
    notifyAccessDenied,
    clearAccessDenied,
  }
})
