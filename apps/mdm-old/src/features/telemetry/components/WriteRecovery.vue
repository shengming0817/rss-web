<script setup lang="ts">
import { VBtn } from 'vuetify/components'

import { useI18n } from 'vue-i18n'
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
      <VBtn :disabled="busy" @click="$emit('compare')">{{ t('telemetry.compare') }}</VBtn
      ><VBtn :disabled="busy || !canWrite" @click="$emit('replay')">{{
        t('telemetry.replay')
      }}</VBtn>
    </div>
    <pre v-if="comparison !== undefined">{{ comparison }}</pre>
  </section>
</template>
