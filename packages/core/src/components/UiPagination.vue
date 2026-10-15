<script setup lang="ts">
import { computed } from 'vue'
import type { UiPaginationState } from './types'
import UiButton from './UiButton.vue'
const props = defineProps<{
  state: UiPaginationState
  label: string
  previousLabel: string
  nextLabel: string
  busy?: boolean
}>()
const emit = defineEmits<{ navigate: [target: number | 'next' | 'previous'] }>()
const previous = computed(() =>
  props.state.kind === 'cursor' ? props.state.hasPrevious : props.state.page > 1,
)
const next = computed(() =>
  props.state.kind === 'cursor' ? props.state.hasNext : props.state.page < props.state.pageCount,
)
function navigate(direction: 'next' | 'previous') {
  emit(
    'navigate',
    props.state.kind === 'cursor' ? direction : props.state.page + (direction === 'next' ? 1 : -1),
  )
}
</script>
<template>
  <nav class="ui-pagination" :aria-label="label">
    <UiButton :disabled="busy || !previous" @click="navigate('previous')">{{
      previousLabel
    }}</UiButton
    ><span v-if="state.kind === 'pages'" class="ui-help" aria-live="polite"
      >{{ state.page }} / {{ state.pageCount }}</span
    ><slot /><UiButton :disabled="busy || !next" @click="navigate('next')">{{
      nextLabel
    }}</UiButton>
  </nav>
</template>
