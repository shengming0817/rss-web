<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { AppShell } from '@rss/core'
import { useUiStore } from '../stores/useUiStore'
import { useGlobalShortcuts } from '../composables/useGlobalShortcuts'
import SessionActions from '../features/identity/SessionActions.vue'
import { createShellNavigation } from '../router/navigation'

const uiStore = useUiStore()
useGlobalShortcuts()
const router = useRouter()
const { t, locale } = useI18n()
const navigationItems = computed(() => {
  void locale.value
  return createShellNavigation(router, t)
})
</script>

<template>
  <AppShell
    v-model:command-palette-open="uiStore.commandPaletteOpen"
    v-model:sidebar-collapsed="uiStore.sidebarCollapsed"
    :navigation-items="navigationItems"
  >
    <template #topbar-actions><SessionActions /></template>
    <RouterView />
  </AppShell>
</template>
