import { ref, shallowRef, watch, onBeforeUnmount } from 'vue'
import { useDa, identityKey } from '../context'
import { errorMessage } from './status'
/** Draft fields remain owned by the editor; a freshly read baseline needs explicit acceptance. */
export function useRevisionReview<T extends { id: string; revision: number }>(
  initial: T | null,
  load: (id: string, signal: AbortSignal) => Promise<T>,
) {
  const r = useDa(),
    revision = ref(initial?.revision ?? 0),
    current = shallowRef<T>(),
    busy = ref(false),
    error = ref('')
  let controller: AbortController | undefined,
    epoch = 0
  function clear() {
    epoch++
    controller?.abort()
    current.value = undefined
    busy.value = false
    error.value = ''
  }
  watch(() => identityKey(r.session), clear, { flush: 'sync' })
  onBeforeUnmount(clear)
  async function refresh() {
    clear()
    if (!initial || !identityKey(r.session)) return
    const version = epoch
    controller = new AbortController()
    busy.value = true
    try {
      const value = await load(initial.id, controller.signal)
      if (version !== epoch) return
      if (value.id !== initial.id) throw new Error('Wrong detail identity')
      current.value = value
    } catch (e) {
      if (version === epoch) error.value = errorMessage(e)
    } finally {
      if (version === epoch) busy.value = false
    }
  }
  function accept() {
    if (!current.value) return false
    revision.value = current.value.revision
    current.value = undefined
    return true
  }
  return { revision, current, busy, error, refresh, accept }
}
