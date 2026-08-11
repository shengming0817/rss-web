<script setup lang="ts">
/**
 * App root — global concerns only (native theme and i18n locale sync).
 *
 * Renders a bare <RouterView/>: the dashboard chrome lives in AppShellLayout
 * (a parent route), so the standalone login page
 * render here without any shell wrapper.
 */
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLocaleStore, useTheme } from '@rss/core'

// Initialize theme (applies data-theme to <html>)
useTheme()

// Sync locale store → vue-i18n
const { locale: i18nLocale } = useI18n()
const localeStore = useLocaleStore()

watch(
  () => localeStore.locale,
  (val) => {
    i18nLocale.value = val
  },
  { immediate: true },
)
</script>

<template>
  <RouterView />
</template>
