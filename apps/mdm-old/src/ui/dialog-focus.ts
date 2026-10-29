import { watch, type Ref } from 'vue'
/** Restore the initiating control after a Vuetify transition finishes. No dialog or business state owner. */
export function useDialogFocus(open: Readonly<Ref<boolean>>) {
  let previous: HTMLElement | undefined
  watch(
    open,
    (value) => {
      if (value && document.activeElement instanceof HTMLElement) previous = document.activeElement
    },
    { flush: 'sync' },
  )
  return () => {
    if (previous?.isConnected) previous.focus()
  }
}
