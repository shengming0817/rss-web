<script setup lang="ts">
defineProps<{ label: string; disabled?: boolean; invalid?: boolean }>()
defineOptions({ inheritAttrs: false })
const model = defineModel<boolean | 'indeterminate'>({ required: true })
</script>
<template>
  <label class="ui-choice"
    ><input
      v-bind="$attrs"
      type="checkbox"
      :aria-invalid="invalid || undefined"
      :checked="model === true"
      :indeterminate="model === 'indeterminate'"
      :disabled="!!disabled"
      @change="model = ($event.target as HTMLInputElement).checked"
    /><span>{{ label }}</span></label
  >
</template>
