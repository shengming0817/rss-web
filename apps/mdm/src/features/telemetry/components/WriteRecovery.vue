<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { UiButton } from '@rss/core/components'
defineProps<{ id: string; busy: boolean; canWrite: boolean; comparison: unknown }>()
defineEmits<{ compare: []; replay: [] }>()
const { t } = useI18n()
</script>
<template>
  <section class="telemetry-notice" role="alert">
    <h3>{{ t('telemetry.unknownResult') }}</h3>
    <p>{{ t('telemetry.compareHint') }}</p>
    <code>{{ id }}</code>
    <div class="telemetry-toolbar">
      <UiButton :disabled="busy" @click="$emit('compare')">{{ t('telemetry.compare') }}</UiButton
      ><UiButton :disabled="busy || !canWrite" @click="$emit('replay')">{{
        t('telemetry.replay')
      }}</UiButton>
    </div>
    <pre v-if="comparison !== undefined">{{ comparison }}</pre>
  </section>
</template>
