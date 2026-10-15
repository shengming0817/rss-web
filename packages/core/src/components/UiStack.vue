<script setup lang="ts">
withDefaults(
  defineProps<{
    direction?: 'row' | 'column'
    gap?: '1' | '2' | '3' | '4' | '6'
    wrap?: boolean
    align?: 'start' | 'center' | 'end' | 'stretch'
  }>(),
  { direction: 'column', gap: '3', align: 'stretch' },
)
</script>
<template>
  <div
    class="ui-stack"
    :style="{
      flexDirection: direction,
      gap: `var(--space-${gap})`,
      flexWrap: wrap ? 'wrap' : 'nowrap',
      alignItems: align,
    }"
  >
    <slot />
  </div>
</template>
