<script setup lang="ts">
import type { UiTone } from './types'
withDefaults(defineProps<{ tone?: UiTone; title: string; announce?: boolean }>(), {
  tone: 'info',
  announce: true,
})
</script>
<template>
  <div
    class="ui-message"
    :class="`ui-tone--${tone}`"
    :role="announce ? (tone === 'danger' ? 'alert' : 'status') : undefined"
  >
    <strong>{{ title }}</strong>
    <div v-if="$slots.default"><slot /></div>
    <slot name="actions" />
  </div>
</template>
