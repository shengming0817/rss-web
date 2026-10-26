<script setup lang="ts">
import { useId } from 'vue'
import { useI18n } from 'vue-i18n'
const alias = defineModel<string | null>('alias', { required: true })
const event = defineModel<string | null>('event', { required: true })
defineProps<{ fixedParameters?: boolean }>()
const { t } = useI18n(),
  id = useId()
</script>
<template>
  <fieldset class="console-form-section" data-section="policy-identity">
    <legend>{{ t('policies.entry.configuration') }}</legend>
    <p>{{ t('policies.entry.identityHint') }}</p>
    <label :for="`${id}-alias`">{{ t('policies.entry.alias') }}</label>
    <input
      :id="`${id}-alias`"
      :value="alias ?? ''"
      class="ui-input"
      maxlength="64"
      pattern="[A-Za-z0-9._\- ]{0,64}"
      data-field="policy-alias"
      @input="alias = ($event.target as HTMLInputElement).value || null"
    />
    <label :for="`${id}-event`">{{ t('policies.entry.event') }}</label>
    <input
      :id="`${id}-event`"
      :value="event ?? ''"
      class="ui-input"
      maxlength="64"
      pattern="[A-Za-z0-9._\- ]{0,64}"
      data-field="policy-event"
      @input="event = ($event.target as HTMLInputElement).value || null"
    />
    <p>{{ t('policies.entry.namesHint') }}</p>
    <p v-if="event && fixedParameters === false" role="alert">
      {{ t('policies.entry.fixedParameters') }}
    </p>
  </fieldset>
</template>
