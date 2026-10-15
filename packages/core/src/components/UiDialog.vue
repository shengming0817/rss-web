<script setup lang="ts">
import { watch } from 'vue'
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from 'reka-ui'
import UiButton from './UiButton.vue'
const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    description?: string
    closeLabel: string
    kind?: 'dialog' | 'alertdialog'
    placement?: 'center' | 'right'
    dismissible?: boolean
  }>(),
  { kind: 'dialog', placement: 'center', dismissible: true },
)
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
let opener: HTMLElement | null = null
// Controlled dialogs can be opened by different table rows, without a fixed Trigger.
watch(
  () => props.open,
  (value) => {
    if (value)
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  },
  { immediate: true, flush: 'sync' },
)
function restore(event: Event) {
  if (opener?.isConnected) {
    event.preventDefault()
    opener.focus()
  }
}
function outside(event: Event) {
  if (!props.dismissible || props.kind === 'alertdialog') event.preventDefault()
}
function escape(event: KeyboardEvent) {
  if (!props.dismissible) event.preventDefault()
}
</script>
<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)"
    ><DialogPortal
      ><DialogOverlay class="ui-dialog-overlay" /><DialogContent
        class="ui-dialog"
        :class="`ui-dialog--${placement}`"
        :role="kind"
        v-bind="description ? {} : { 'aria-describedby': undefined }"
        @close-auto-focus="restore"
        @pointer-down-outside="outside"
        @escape-key-down="escape"
        ><header class="ui-dialog-header">
          <DialogTitle class="ui-dialog-title">{{ title }}</DialogTitle
          ><DialogClose as-child
            ><UiButton variant="ghost" :aria-label="closeLabel" :disabled="!dismissible"
              >×</UiButton
            ></DialogClose
          >
        </header>
        <DialogDescription v-if="description" class="ui-dialog-description">{{
          description
        }}</DialogDescription>
        <div class="ui-dialog-body"><slot /></div>
        <footer v-if="$slots.footer" class="ui-dialog-footer">
          <slot name="footer" /></footer></DialogContent></DialogPortal
  ></DialogRoot>
</template>
