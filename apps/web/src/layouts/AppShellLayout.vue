<script setup lang="ts">
import { AppShell } from '@gocell/core'
import { useUiStore } from '../stores/useUiStore'
import { useGlobalShortcuts } from '../composables/useGlobalShortcuts'

const uiStore = useUiStore()
useGlobalShortcuts()
</script>

<template>
  <AppShell
    v-model:command-palette-open="uiStore.commandPaletteOpen"
    v-model:sidebar-collapsed="uiStore.sidebarCollapsed"
  >
    <RouterView />
  </AppShell>
</template>
