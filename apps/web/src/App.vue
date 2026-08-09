<script setup lang="ts">
/**
 * App root — global concerns only (theme, i18n locale sync, AntD theme provider).
 *
 * Renders a bare <RouterView/>: the dashboard chrome lives in AppShellLayout
 * (a parent route), so standalone full-screen pages (login, first-run-setup)
 * render here without any shell wrapper.
 */
import { watch } from 'vue'
import { ConfigProvider } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { useTheme, useThemeTokens, useLocaleStore } from '@gocell/core'

// Initialize theme (applies data-theme to <html>)
useTheme()
const { themeConfig } = useThemeTokens()

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

// Note: AntD ConfigProvider locale is not wired yet; added in a later batch
// with zh-CN/en-US locale objects.
</script>

<template>
  <ConfigProvider :theme="themeConfig">
    <RouterView />
  </ConfigProvider>
</template>
