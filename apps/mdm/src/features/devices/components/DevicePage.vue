<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTheme } from '@rss/core/composables'
import { useI18n } from 'vue-i18n'
import 'virtual:mdm-device-styles.css'
import '../device-workspace.css'
defineProps<{ title: string; description?: string; busy?: boolean; failure?: string | null }>()
const { t, locale } = useI18n()
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
        <section
          class="console-page mdm-device-surface"
          :class="`v-theme--${theme}`"
          :aria-busy="busy || undefined"
        >
          <header class="device-page-heading">
            <div>
              <slot name="breadcrumb" />
              <h1>{{ title }}</h1>
              <p v-if="description" class="device-muted">{{ description }}</p>
            </div>
            <div class="device-actions">
              <v-progress-circular
                v-if="busy"
                indeterminate
                size="20"
                :aria-label="t('devices.loading')"
              /><slot name="actions" />
            </div>
          </header>
          <v-alert v-if="failure" type="error" variant="tonal" role="alert" class="device-notice">{{
            t(`devices.${failure}`)
          }}</v-alert>
          <slot />
          <div ref="overlays" class="device-overlays"></div>
        </section>
      </v-defaults-provider>
    </v-locale-provider>
  </v-theme-provider>
</template>
