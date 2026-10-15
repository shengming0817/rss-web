<script setup lang="ts">
import UiButton from './UiButton.vue'
defineProps<{
  label: string
  clearLabel: string
  placeholder?: string
  disabled?: boolean
  readonly?: boolean
  invalid?: boolean
}>()
const emit = defineEmits<{ search: [query: string] }>()
defineOptions({ inheritAttrs: false })
const model = defineModel<string>({ required: true })
</script>
<template>
  <div class="ui-search">
    <input
      v-bind="$attrs"
      v-model="model"
      class="ui-input"
      type="search"
      :aria-label="label"
      :placeholder="placeholder"
      :disabled="!!disabled"
      :readonly="readonly"
      :aria-invalid="invalid || undefined"
      @keydown.enter.prevent="emit('search', model)"
    /><UiButton
      v-if="model"
      variant="ghost"
      :disabled="!!disabled || !!readonly"
      :aria-label="clearLabel"
      @click="model = ''"
      >×</UiButton
    >
  </div>
</template>
