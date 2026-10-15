<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { formatUtc, parseUtc } from './utc'
const props = defineProps<{
  id: string
  min?: number
  max?: number
  error?: string
  invalid?: boolean
  invalidLabel: string
  disabled?: boolean
  readonly?: boolean
  required?: boolean
}>()
defineOptions({ inheritAttrs: false })
const model = defineModel<number | null>({ required: true })
const input = ref<HTMLInputElement>()
const displayed = computed(() => formatUtc(model.value))
watchEffect(() =>
  input.value?.setCustomValidity(
    props.error || (model.value !== null && !displayed.value ? props.invalidLabel : ''),
  ),
)
</script>
<template>
  <span class="ui-utc"
    ><input
      v-bind="$attrs"
      :id="id"
      ref="input"
      class="ui-input"
      type="datetime-local"
      :value="displayed"
      :min="formatUtc(min ?? 0)"
      :max="formatUtc(max ?? 253402300799)"
      :aria-describedby="[$attrs['aria-describedby'], `${id}-utc`].filter(Boolean).join(' ')"
      :aria-invalid="invalid || !!error || (model !== null && !displayed) || undefined"
      :required="required"
      :disabled="!!disabled"
      :readonly="readonly"
      step="1"
      @input="model = parseUtc(($event.target as HTMLInputElement).value)"
    /><output :id="`${id}-utc`" :for="id" class="ui-help"
      >{{ displayed ? displayed.replace('T', ' ') : '—' }} UTC</output
    ></span
  >
</template>
