<script setup lang="ts">
withDefaults(
  defineProps<{ kind?: 'date' | 'time'; min?: string; max?: string; invalid?: boolean }>(),
  { kind: 'date' },
)
const model = defineModel<string | null>({ required: true })
</script>
<template>
  <input
    class="ui-input"
    :type="kind"
    :value="model ?? ''"
    :min="min"
    :max="max"
    :aria-invalid="invalid || undefined"
    @input="model = ($event.target as HTMLInputElement).value || null"
  />
</template>
