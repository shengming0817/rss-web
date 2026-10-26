<script setup lang="ts">
import { watch, nextTick, useId } from 'vue'
import {
  VBtn,
  VCard,
  VCardActions,
  VCardText,
  VCardTitle,
  VDialog,
  VSpacer,
} from 'vuetify/components'
const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    description?: string
    closeLabel: string
    dismissible?: boolean
    placement?: string
    kind?: string
  }>(),
  { dismissible: true },
)
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const descriptionId = useId()
let restoreFocus: HTMLElement | null = null
watch(
  () => props.open,
  (open) => {
    if (open)
      restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    else
      void nextTick(() => {
        if (restoreFocus?.isConnected) restoreFocus.focus()
      })
  },
  { immediate: true, flush: 'sync' },
)
</script>
<template>
  <VDialog
    v-if="open"
    :model-value="open"
    :persistent="!dismissible"
    max-width="960"
    scrollable
    :role="kind === 'alertdialog' ? 'alertdialog' : 'dialog'"
    :aria-label="title"
    :aria-describedby="description ? descriptionId : undefined"
    @update:model-value="emit('update:open', $event)"
  >
    <VCard>
      <VCardTitle tag="h2" class="d-flex align-center ga-2 text-wrap"
        >{{ title }}<VSpacer /><VBtn
          variant="text"
          :disabled="!dismissible"
          @click="emit('update:open', false)"
          >{{ closeLabel }}</VBtn
        ></VCardTitle
      >
      <VCardText
        ><p v-if="description" :id="descriptionId">{{ description }}</p>
        <slot
      /></VCardText>
      <VCardActions v-if="$slots.footer" class="flex-wrap ga-2"
        ><slot name="footer"
      /></VCardActions>
    </VCard>
  </VDialog>
</template>
