<script setup lang="ts">
import {
  ToastProvider,
  ToastRoot,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastViewport,
} from 'reka-ui'
import type { UiNotice } from './types'
defineProps<{
  label: string
  closeLabel: string
  notices: readonly UiNotice[]
  duration?: number
}>()
const emit = defineEmits<{ dismiss: [id: string] }>()
</script>
<template>
  <ToastProvider :label="label" :duration="duration ?? 5000"
    ><ToastRoot
      v-for="notice in notices"
      :key="notice.id"
      class="ui-toast"
      :class="`ui-tone--${notice.tone ?? 'neutral'}`"
      :open="true"
      @update:open="!$event && emit('dismiss', notice.id)"
      ><ToastTitle class="ui-toast-title">{{ notice.title }}</ToastTitle
      ><ToastDescription v-if="notice.description">{{ notice.description }}</ToastDescription
      ><ToastClose class="ui-button ui-button--ghost" :aria-label="closeLabel"
        >×</ToastClose
      ></ToastRoot
    ><ToastViewport class="ui-toast-viewport" :label="label"
  /></ToastProvider>
</template>
