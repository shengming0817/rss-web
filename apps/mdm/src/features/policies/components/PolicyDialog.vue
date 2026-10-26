<script setup lang="ts">
import { computed } from 'vue'
import { VBtn, VCard, VCardActions, VCardText, VCardTitle, VDialog } from 'vuetify/components'
import { useDialogFocus } from '../../../ui/dialog-focus'
const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    closeLabel: string
    dismissible?: boolean
    placement?: string
  }>(),
  { dismissible: true },
)
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const restoreFocus = useDialogFocus(computed(() => props.open))
</script>
<template>
  <VDialog
    :model-value="open"
    :persistent="!dismissible"
    max-width="1000"
    scrollable
    @update:model-value="emit('update:open', $event)"
    @after-leave="restoreFocus"
  >
    <VCard>
      <VCardTitle class="d-flex align-center justify-space-between"
        ><h2 class="text-h6">{{ title }}</h2>
        <VBtn variant="text" :disabled="!dismissible" @click="emit('update:open', false)">{{
          closeLabel
        }}</VBtn></VCardTitle
      >
      <VCardText><slot /></VCardText>
      <VCardActions v-if="$slots['footer']"><slot name="footer" /></VCardActions>
    </VCard>
  </VDialog>
</template>
