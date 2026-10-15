<script setup lang="ts">
defineProps<{ label?: string }>()
</script>
<template>
  <section class="ui-surface" :aria-label="label"><slot /></section>
</template>
