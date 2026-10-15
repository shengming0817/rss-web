<script setup lang="ts">
defineProps<{ min?: number; max?: number; step?: number; invalid?: boolean }>()
const model = defineModel<number | null>({ required: true })
function input(event: Event) {
  const value = (event.target as HTMLInputElement).valueAsNumber
  model.value = Number.isFinite(value) ? value : null
}
</script>
<template>
  <input
    class="ui-input"
    type="number"
    :value="model ?? ''"
    :min="min"
    :max="max"
    :step="step"
    :aria-invalid="invalid || undefined"
    @input="input"
  />
</template>
