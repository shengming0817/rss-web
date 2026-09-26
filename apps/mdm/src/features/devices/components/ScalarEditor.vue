<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Scalar } from '../clients/asset-model'
const props = defineProps<{ modelValue: Scalar }>()
const emit = defineEmits<{ 'update:modelValue': [value: Scalar] }>()
const { t } = useI18n()
function input(event: Event) {
  const target = event.target as HTMLInputElement
  const kind = props.modelValue.kind
  if (kind === 'boolean') emit('update:modelValue', { kind, value: target.value === 'true' })
  else if (kind === 'string') emit('update:modelValue', { kind, value: target.value })
  else {
    const value = Number(target.value)
    target.setCustomValidity(
      target.value !== '' && Number.isSafeInteger(value) ? '' : t('devices.invalidResponse'),
    )
    if (target.validity.valid) emit('update:modelValue', { kind, value })
  }
}
</script>
<template>
  <select
    v-if="modelValue.kind === 'boolean'"
    :aria-label="t('devices.value')"
    :value="String(modelValue.value)"
    @change="input"
  >
    <option value="false">{{ t('devices.no') }}</option>
    <option value="true">{{ t('devices.yes') }}</option>
  </select>
  <input
    v-else
    :aria-label="t('devices.value')"
    :type="modelValue.kind === 'string' ? 'text' : 'number'"
    :value="modelValue.value"
    :maxlength="modelValue.kind === 'string' ? 256 : undefined"
    step="1"
    required
    @input="input"
  />
  <small v-if="modelValue.kind === 'time'">{{ t('devices.observed') }}</small>
</template>
