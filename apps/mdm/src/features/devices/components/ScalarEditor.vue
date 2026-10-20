<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Scalar } from '../clients/asset-model'
const props = defineProps<{ modelValue: Scalar }>()
const emit = defineEmits<{ 'update:modelValue': [value: Scalar] }>()
const { t } = useI18n()
const timeValue = computed(() =>
  props.modelValue.kind === 'time' &&
  props.modelValue.value >= 0 &&
  props.modelValue.value <= 253402300799
    ? new Date(props.modelValue.value * 1000).toISOString().slice(0, 19)
    : '',
)
function input(event: Event) {
  const target = event.target as HTMLInputElement
  const kind = props.modelValue.kind
  if (kind === 'boolean') emit('update:modelValue', { kind, value: target.value === 'true' })
  else if (kind === 'string') emit('update:modelValue', { kind, value: target.value })
  else if (kind === 'time') {
    const value = Date.parse(target.value + 'Z') / 1000
    target.setCustomValidity(
      Number.isSafeInteger(value) && value >= 0 ? '' : t('devices.invalidResponse'),
    )
    if (target.validity.valid) emit('update:modelValue', { kind, value })
  } else {
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
    class="ui-input"
    :aria-label="t('devices.value')"
    :value="String(modelValue.value)"
    @change="input"
  >
    <option value="false">{{ t('devices.no') }}</option>
    <option value="true">{{ t('devices.yes') }}</option>
  </select>
  <input
    v-else
    class="ui-input"
    :aria-label="t('devices.value')"
    :type="
      modelValue.kind === 'time'
        ? 'datetime-local'
        : modelValue.kind === 'string'
          ? 'text'
          : 'number'
    "
    :value="modelValue.kind === 'time' ? timeValue : modelValue.value"
    :maxlength="modelValue.kind === 'string' ? 256 : undefined"
    step="1"
    required
    @input="input"
  />
  <small v-if="modelValue.kind === 'time'">UTC</small>
</template>
