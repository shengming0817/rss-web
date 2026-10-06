import { onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { BinaryResponse } from '@rss/api/mdm'
import { useMdm } from '../../context'
/** Component-local delivery lifetime; never another credential or session owner. */
export function useAttachment() {
  const runtime = useMdm(),
    route = useRoute(),
    url = ref<string>(),
    filename = ref<string>()
  let generation = 0,
    timer: ReturnType<typeof setTimeout> | undefined
  function clear() {
    generation++
    if (url.value) URL.revokeObjectURL(url.value)
    url.value = undefined
    filename.value = undefined
    clearTimeout(timer)
  }
  function stamp() {
    return generation
  }
  function deliver(file: BinaryResponse, name: string, own: number) {
    try {
      if (own !== generation || document.visibilityState === 'hidden') return
      clear()
      url.value = URL.createObjectURL(
        new Blob([file.bytes], { type: file.contentType ?? 'application/octet-stream' }),
      )
      filename.value = name
      timer = setTimeout(clear, 60_000)
    } finally {
      new Uint8Array(file.bytes).fill(0)
    }
  }
  watch(
    () => [
      route.fullPath,
      runtime.session.state.value.status,
      runtime.session.state.value.identity?.principalId,
      runtime.session.state.value.session?.id,
      runtime.session.state.value.tenant,
    ],
    clear,
    { flush: 'sync' },
  )
  function visibility() {
    if (document.visibilityState === 'hidden') clear()
  }
  window.addEventListener('pagehide', clear)
  document.addEventListener('visibilitychange', visibility)
  onBeforeUnmount(() => {
    clear()
    window.removeEventListener('pagehide', clear)
    document.removeEventListener('visibilitychange', visibility)
  })
  return { url, filename, clear, stamp, deliver }
}
