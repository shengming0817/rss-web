<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { VTextField } from 'vuetify/components'
const props = defineProps<{ id: string; min?: number; max?: number; error?: string; invalid?: boolean; invalidLabel: string; disabled?: boolean; readonly?: boolean; required?: boolean }>()
const model = defineModel<number | null>({ required: true })
const input = ref<InstanceType<typeof VTextField>>()
function format(value: number | null): string {
  return value !== null && Number.isSafeInteger(value) && value >= 0 && value <= 253402300799 ? new Date(value * 1000).toISOString().slice(0, 19) : ''
}
const displayed = computed(() => format(model.value))
function update(value: string) {
  const normalized = value.length === 16 ? value + ':00' : value
  const seconds = Date.parse(normalized + 'Z') / 1000
  model.value = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(normalized) && format(seconds) === normalized ? seconds : null
}
watchEffect(() => input.value?.$el.querySelector('input')?.setCustomValidity(props.error || (model.value !== null && !displayed.value ? props.invalidLabel : '')))
</script>
<template>
  <VTextField v-bind="$attrs" :id="id" ref="input" :model-value="displayed" type="datetime-local" :min="format(min ?? 0)" :max="format(max ?? 253402300799)" :error="!!(invalid || error)" :error-messages="error ?? ''" :required="required" :disabled="!!disabled" :readonly="!!readonly" suffix="UTC" variant="outlined" density="comfortable" hide-details="auto" step="1" @update:model-value="update" />
</template>
