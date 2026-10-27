<script setup lang="ts">
import PolicyFieldset from './PolicyFieldset.vue'
import { VTextField } from 'vuetify/components'

import { useId } from 'vue'
import { useI18n } from 'vue-i18n'
defineProps<{ fixedParameters?: boolean }>()
const alias = defineModel<string | null>('alias', { required: true })
const event = defineModel<string | null>('event', { required: true })
const { t } = useI18n(),
  id = useId()
</script>
<template>
  <PolicyFieldset class="console-form-section" data-section="policy-identity">
    <legend>{{ t('policies.entry.configuration') }}</legend>
    <p>{{ t('policies.entry.identityHint') }}</p>
    <label :for="`${id}-alias`">{{ t('policies.entry.alias') }}</label>
    <VTextField
      :id="`${id}-alias`"
      maxlength="64"
      pattern="[A-Za-z0-9._\- ]{0,64}"
      data-field="policy-alias"
      :model-value="alias ?? ''"
      variant="outlined"
      density="comfortable"
      hide-details="auto"
      @input="alias = ($event.target as HTMLInputElement).value || null"
    />
    <label :for="`${id}-event`">{{ t('policies.entry.event') }}</label>
    <VTextField
      :id="`${id}-event`"
      maxlength="64"
      pattern="[A-Za-z0-9._\- ]{0,64}"
      data-field="policy-event"
      :model-value="event ?? ''"
      variant="outlined"
      density="comfortable"
      hide-details="auto"
      @input="event = ($event.target as HTMLInputElement).value || null"
    />
    <p>{{ t('policies.entry.namesHint') }}</p>
    <p v-if="event && fixedParameters === false" role="alert">
      {{ t('policies.entry.fixedParameters') }}
    </p>
  </PolicyFieldset>
</template>
