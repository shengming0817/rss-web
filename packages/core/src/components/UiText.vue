<script setup lang="ts">
withDefaults(
  defineProps<{
    as?: 'span' | 'p' | 'h1' | 'h2' | 'h3'
    muted?: boolean
    size?: 'sm' | 'base' | 'lg'
  }>(),
  { as: 'span', size: 'base' },
)
</script>
<template>
  <component :is="as" class="ui-text" :class="[{ 'ui-muted': muted }, `ui-text--${size}`]"
    ><slot
  /></component>
</template>
