<script setup lang="ts">
import { AppShell } from '@rss/core'
import { useUiStore } from '../stores/useUiStore'
import { useGlobalShortcuts } from '../composables/useGlobalShortcuts'
import SessionActions from '../features/identity/SessionActions.vue'

const uiStore = useUiStore()
useGlobalShortcuts()
</script>

<template>
  <AppShell
    v-model:command-palette-open="uiStore.commandPaletteOpen"
    v-model:sidebar-collapsed="uiStore.sidebarCollapsed"
  >
    <template #topbar-actions><SessionActions /></template>
    <RouterView />
  </AppShell>
</template>
