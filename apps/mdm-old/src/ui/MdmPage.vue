<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import MdmSurface from './MdmSurface.vue'
withDefaults(
  defineProps<{
    title: string
    description?: string
    busy?: boolean
    failure?: string | null
    failurePrefix?: string
  }>(),
  { failurePrefix: 'devices' },
)
const { t } = useI18n()
</script>
<template>
  <MdmSurface>
    <section class="console-page" :aria-busy="busy || undefined">
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
        t(
          failure === 'removeBeforeSwitch'
            ? 'policies.selfService.removeBeforeSwitch'
            : `${failurePrefix}.${failure}`,
        )
      }}</v-alert>
      <slot />
    </section>
  </MdmSurface>
</template>
