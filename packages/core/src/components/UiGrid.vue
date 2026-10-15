<script setup lang="ts">
withDefaults(defineProps<{ minWidth?: string; gap?: '1' | '2' | '3' | '4' | '6' }>(), {
  minWidth: '16rem',
  gap: '4',
})
</script>
<template>
  <div
    class="ui-grid"
    :style="{
      gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${minWidth}), 1fr))`,
      gap: `var(--space-${gap})`,
    }"
  >
    <slot />
  </div>
</template>
