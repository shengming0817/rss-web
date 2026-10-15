<script setup lang="ts">
defineProps<{ label: string; value?: number; max?: number }>()
</script>
<template>
  <progress class="ui-progress" :aria-label="label" :value="value" :max="max ?? 100" />
</template>
