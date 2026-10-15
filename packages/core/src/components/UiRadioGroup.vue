<script setup lang="ts">
import { useId } from 'vue'
import type { UiOption } from './types'
defineProps<{ label: string; options: readonly UiOption[]; disabled?: boolean }>()
const model = defineModel<string>({ required: true })
const name = useId()
</script>
<template>
  <fieldset class="ui-radio-group" :disabled="!!disabled">
    <legend class="ui-label">{{ label }}</legend>
    <label v-for="option in options" :key="option.value" class="ui-choice"
      ><input
        v-model="model"
        type="radio"
        :name="name"
        :value="option.value"
        :disabled="!!option.disabled"
      /><span>{{ option.label }}</span></label
    >
  </fieldset>
</template>
