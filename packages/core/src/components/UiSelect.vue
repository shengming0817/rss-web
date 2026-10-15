<script setup lang="ts">
import type { UiOption } from './types'
defineProps<{ options: readonly UiOption[]; invalid?: boolean }>()
const model = defineModel<string>({ required: true })
</script>
<template>
  <select v-model="model" class="ui-input ui-select" :aria-invalid="invalid || undefined">
    <option
      v-for="option in options"
      :key="option.value"
      :value="option.value"
      :disabled="!!option.disabled"
    >
      {{ option.label }}
    </option>
  </select>
</template>
