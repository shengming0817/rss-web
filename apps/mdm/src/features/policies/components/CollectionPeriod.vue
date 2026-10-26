<script setup lang="ts">
import { VTextField } from 'vuetify/components'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { defaultCollectionSchedule, type Schedule } from '../clients/model'
defineProps<{ disabled?: boolean }>()
const model = defineModel<Schedule>({ required: true })
const { t } = useI18n()
const seconds = computed({
  get: () => (model.value.trigger.kind === 'interval' ? model.value.trigger.seconds : 3600),
  set: (value: number) => {
    model.value = {
      ...defaultCollectionSchedule(),
      trigger: {
        kind: 'interval',
        anchor: model.value.trigger.kind === 'interval' ? model.value.trigger.anchor : 0,
        seconds: value,
      },
    }
  },
})
</script>
<template>
  <label
    >{{ t('policies.collectionPeriod')
    }}<VTextField
      v-model.number="seconds"
      data-field="collection-period"
      type="number"
      min="60"
      max="31536000"
      step="1"
      required
      :disabled="!!disabled"
      variant="outlined"
      density="comfortable"
      hide-details="auto"
  /></label>
  <p>{{ t('policies.collectionPeriodNote') }}</p>
</template>
