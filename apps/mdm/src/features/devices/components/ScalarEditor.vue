<script setup lang="ts">
import { VSelect, VTextField } from 'vuetify/components'
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
  <v-select
    v-if="modelValue.kind === 'boolean'"
    :model-value="modelValue.value"
    :label="t('devices.value')"
    :items="[
      { value: false, title: t('devices.no') },
      { value: true, title: t('devices.yes') },
    ]"
    @update:model-value="emit('update:modelValue', { kind: 'boolean', value: $event })"
  />
  <v-text-field
    v-else
    :model-value="modelValue.kind === 'time' ? timeValue : modelValue.value"
    :label="t('devices.value')"
    :type="
      modelValue.kind === 'time'
        ? 'datetime-local'
        : modelValue.kind === 'string'
          ? 'text'
          : 'number'
    "
    :maxlength="modelValue.kind === 'string' ? 256 : undefined"
    step="1"
    required
    :hint="modelValue.kind === 'time' ? 'UTC' : undefined"
    persistent-hint
    @input="input"
  />
</template>
