<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
const props = defineProps<{
  id: string
  min?: number
  max?: number
  error?: string
  description?: string
}>()
const model = defineModel<number>({ required: true })
const { t } = useI18n(),
  input = ref<HTMLInputElement>()
function format(value: number) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 253402300799
    ? new Date(value * 1000).toISOString().slice(0, 19)
    : ''
}
const displayed = computed(() => format(model.value))
watchEffect(() =>
  input.value?.setCustomValidity(props.error || (displayed.value ? '' : t('policies.invalidDate'))),
)
function change(event: Event) {
  const value = (event.target as HTMLInputElement).value
  const normalized = value.length === 16 ? `${value}:00` : value
  const seconds = Date.parse(`${normalized}Z`) / 1000
  model.value =
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(normalized) && format(seconds) === normalized
      ? seconds
      : Number.NaN
}
</script>
<template>
  <span class="utc-time-input">
    <input
      :id="id"
      ref="input"
      type="datetime-local"
      :value="displayed"
      :min="format(min ?? 0)"
      :max="format(max ?? 253402300799)"
      :aria-describedby="[description, `${id}-utc`].filter(Boolean).join(' ')"
      step="1"
      required
      @input="change"
    />
    <output :id="`${id}-utc`" :for="id"
      >{{ displayed ? displayed.replace('T', ' ') : '—' }} UTC</output
    >
  </span>
</template>
