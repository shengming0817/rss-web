<script setup lang="ts">
import { useId } from 'vue'
import type { UiOption } from './types'
defineProps<{
  label: string
  options: readonly UiOption[]
  multiple?: boolean
  disabled?: boolean
  emptyLabel: string
}>()
const selected = defineModel<string[]>({ required: true })
const name = useId()
function select(value: string, checked: boolean, multiple: boolean) {
  selected.value = multiple
    ? checked
      ? [...selected.value.filter((v) => v !== value), value]
      : selected.value.filter((v) => v !== value)
    : [value]
}
</script>
<template>
  <fieldset class="ui-list" :disabled="!!disabled">
    <legend class="ui-label">{{ label }}</legend>
    <label v-for="option in options" :key="option.value" class="ui-list-item"
      ><input
        :type="multiple ? 'checkbox' : 'radio'"
        :name="name"
        :checked="selected.includes(option.value)"
        :disabled="!!option.disabled"
        @change="select(option.value, ($event.target as HTMLInputElement).checked, !!multiple)"
      /><slot :option="option">{{ option.label }}</slot></label
    >
    <p v-if="!options.length" class="ui-help">{{ emptyLabel }}</p>
  </fieldset>
</template>
