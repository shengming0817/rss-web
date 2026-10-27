<script setup lang="ts">
import { computed, nextTick, useId, watch } from 'vue'
import { VBtn, VCard, VCardActions, VCardText, VCardTitle, VDialog } from 'vuetify/components'
import { useDialogFocus } from '../../../ui/dialog-focus'
const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    closeLabel: string
    dismissible?: boolean
    placement?: string
    description?: string
    kind?: 'dialog' | 'alertdialog'
  }>(),
  { dismissible: true },
)
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const titleId = useId()
const restoreFocus = useDialogFocus(computed(() => props.open))
watch(
  () => props.open,
  async (open) => {
    if (!open) {
      await nextTick()
      restoreFocus()
    }
  },
)
</script>
<template>
  <VDialog
    v-if="open"
    :data-state="open ? 'open' : 'closed'"
    :role="kind ?? 'dialog'"
    :aria-labelledby="titleId"
    :model-value="open"
    :persistent="!dismissible"
    max-width="1000"
    scrollable
    @update:model-value="emit('update:open', $event)"
    @after-leave="restoreFocus"
  >
    <VCard>
      <VCardTitle class="d-flex align-center justify-space-between"
        ><h2 :id="titleId" class="text-h6">{{ title }}</h2>
        <VBtn
          variant="text"
          :aria-label="closeLabel"
          :disabled="!dismissible"
          @click="emit('update:open', false)"
          >{{ closeLabel }}</VBtn
        ></VCardTitle
      >
      <VCardText
        ><p v-if="description">{{ description }}</p>
        <slot
      /></VCardText>
      <VCardActions v-if="$slots['footer']"><slot name="footer" /></VCardActions>
    </VCard>
  </VDialog>
</template>
