<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTheme } from '@rss/core/composables'
import { useI18n } from 'vue-i18n'
import 'virtual:mdm-device-styles.css'
import './workspace.css'
const { locale } = useI18n()
const { theme } = useTheme()
const overlays = ref<HTMLElement>()
const defaults = computed(() => ({
  VDialog: { attach: overlays.value ?? true },
  VMenu: { attach: overlays.value ?? true },
}))
</script>
<template>
  <v-theme-provider :theme="theme">
    <v-locale-provider :locale="locale === 'zh-CN' ? 'zhHans' : 'en'">
      <v-defaults-provider :defaults="defaults">
        <div class="mdm-device-surface" :class="`v-theme--${theme}`">
          <slot />
          <div ref="overlays" class="device-overlays"></div>
        </div>
      </v-defaults-provider>
    </v-locale-provider>
  </v-theme-provider>
</template>
