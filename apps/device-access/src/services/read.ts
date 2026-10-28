import { ref, shallowRef, watch, onBeforeUnmount, type WatchSource } from 'vue'
import { useDa, identityKey } from '../context'
import { errorMessage } from './status'
/** A page request cannot settle into another device or identity context. */
export function useRead<T>(
  load: (signal: AbortSignal) => Promise<T>,
  dependencies: WatchSource = () => null,
  options: { accepted?: (value: T) => void; enabled?: () => boolean } = {},
) {
  const runtime = useDa(),
    data = shallowRef<T>(),
    busy = ref(false),
    error = ref('')
  let controller: AbortController | undefined,
    epoch = 0
  function reset() {
    controller?.abort()
    epoch++
    data.value = undefined
    error.value = ''
    busy.value = false
  }
  async function reload() {
    reset()
    if (!identityKey(runtime.session) || options.enabled?.() === false) return
    const current = epoch
    controller = new AbortController()
    busy.value = true
    try {
      const value = await load(controller.signal)
      if (current === epoch) {
        options.accepted?.(value)
        data.value = value
        return value
      }
    } catch (e) {
      if (current === epoch) error.value = errorMessage(e)
    } finally {
      if (current === epoch) busy.value = false
    }
  }
  watch(
    [() => identityKey(runtime.session), dependencies],
    () => {
      void reload()
    },
    { immediate: true, flush: 'sync' },
  )
  onBeforeUnmount(reset)
  return { data, busy, error, reload, reset }
}
