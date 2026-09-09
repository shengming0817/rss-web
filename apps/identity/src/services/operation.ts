import { onBeforeUnmount, ref } from 'vue'
import { isRssApiError } from '@rss/api/identity'
export function useOperation() {
  const busy = ref(false)
  const error = ref('')
  let active = true
  onBeforeUnmount(() => {
    active = false
  })
  async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
    if (busy.value) return undefined
    busy.value = true
    error.value = ''
    try {
      const result = await work()
      return active ? result : undefined
    } catch (failure) {
      if (active)
        error.value =
          isRssApiError(failure) && failure.cause === 'wire' ? failure.code : 'unknown_result'
      return undefined
    } finally {
      if (active) busy.value = false
    }
  }
  function checkpoint() {
    if (!active) throw new Error('Operation abandoned')
  }
  return { busy, error, run, checkpoint }
}
