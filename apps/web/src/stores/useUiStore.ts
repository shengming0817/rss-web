import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * useUiStore — global UI state for apps/web layout shell.
 *
 * Owns commandPaletteOpen / sidebarCollapsed so that:
 *  - AppShell can v-model bind them (additive props)
 *  - useGlobalShortcuts can read/write them without prop-drilling
 */
export const useUiStore = defineStore('web.ui', () => {
  const commandPaletteOpen = ref(false)
  const sidebarCollapsed = ref(false)

  function openCommandPalette(): void {
    commandPaletteOpen.value = true
  }

  function closeCommandPalette(): void {
    commandPaletteOpen.value = false
  }

  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  return {
    commandPaletteOpen,
    sidebarCollapsed,
    openCommandPalette,
    closeCommandPalette,
    toggleSidebar,
  }
})
