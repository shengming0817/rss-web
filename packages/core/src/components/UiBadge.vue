<script setup lang="ts">
import type { UiTone } from './types'
withDefaults(defineProps<{ tone?: UiTone }>(), { tone: 'neutral' })
</script>
<template>
  <span class="ui-badge" :class="`ui-tone--${tone}`"><slot /></span>
</template>
