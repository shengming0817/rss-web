<script setup lang="ts">
import { computed, nextTick, watch } from 'vue'
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
    :content-props="{ 'data-state': open ? 'open' : 'closed', role: kind ?? 'dialog' }"
    :model-value="open"
    :persistent="!dismissible"
    max-width="1000"
    scrollable
    @update:model-value="emit('update:open', $event)"
    @after-leave="restoreFocus"
  >
    <VCard :data-state="open ? 'open' : 'closed'">
      <VCardTitle class="d-flex align-center justify-space-between"
        ><h2 class="text-h6">{{ title }}</h2>
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
