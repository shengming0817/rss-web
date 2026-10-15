<script setup lang="ts">
defineProps<{ label?: string; size?: number }>()
</script>
<template>
  <span
    class="ui-icon"
    :style="size ? { width: `${size}px`, height: `${size}px` } : undefined"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : true"
    ><slot
  /></span>
</template>
