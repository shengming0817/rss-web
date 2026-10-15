<script setup lang="ts">
withDefaults(
  defineProps<{
    type?: 'text' | 'password' | 'email' | 'url' | 'tel' | 'search'
    invalid?: boolean
    readonly?: boolean
    disabled?: boolean
  }>(),
  { type: 'text' },
)
const model = defineModel<string>({ required: true })
</script>
<template>
  <input
    v-model="model"
    class="ui-input"
    :type="type"
    :readonly="readonly"
    :disabled="disabled"
    :aria-invalid="invalid || undefined"
  />
</template>
