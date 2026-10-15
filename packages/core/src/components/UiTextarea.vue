<script setup lang="ts">
defineProps<{ invalid?: boolean }>()
const model = defineModel<string>({ required: true })
</script>
<template>
  <textarea v-model="model" class="ui-input ui-textarea" :aria-invalid="invalid || undefined" />
</template>
