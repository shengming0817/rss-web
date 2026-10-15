<script setup lang="ts">
defineProps<{ label: string }>()
</script>
<template>
  <span role="status" class="ui-spinner-label"
    ><span class="ui-spinner" aria-hidden="true" /><span>{{ label }}</span></span
  >
</template>
