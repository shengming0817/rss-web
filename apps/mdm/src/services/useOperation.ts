import { onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { isRssApiError } from '@rss/api/mdm'
/** View-local late-response fencing. The app session remains the sole credential owner. */
export function useOperation() {
  const busy = ref(false),
    uncertain = ref(false),
    failure = ref<string | null>(null)
  const route = useRoute()
  let generation = 0,
    disposed = false
  watch(
    () => route.fullPath,
    () => {
      generation++
      uncertain.value = false
      busy.value = false
      failure.value = null
    },
    { flush: 'sync' },
  )
  onBeforeUnmount(() => {
    disposed = true
    generation++
  })
  async function perform<T>(write: boolean, request: () => Promise<T>, apply: (result: T) => void) {
    if (busy.value || disposed) return false
    const current = generation
    busy.value = true
    failure.value = null
    try {
      const result = await request()
      if (disposed || current !== generation) return false
      if (write) uncertain.value = false
      apply(result)
      return true
    } catch (e) {
      if (!disposed && current === generation) {
        if (
          write &&
          (!isRssApiError(e) ||
            ['network', 'timeout', 'aborted', 'protocol'].includes(e.cause) ||
            e.code === 'operation_unknown' ||
            e.code === 'operation_rollback_unconfirmed')
        )
          uncertain.value = true
        failure.value =
          write && uncertain.value
            ? 'unknownWrite'
            : isRssApiError(e)
              ? e.status === 413
                ? 'requestTooLarge'
                : e.status === 409
                  ? 'conflict'
                  : e.code === 'operation_unknown' || e.code === 'operation_rollback_unconfirmed'
                    ? 'unknownWrite'
                    : e.status === 403
                      ? 'denied'
                      : e.status === 501
                        ? 'unsupported'
                        : 'unavailable'
              : 'invalidResponse'
      }
      return false
    } finally {
      if (!disposed && current === generation) busy.value = false
    }
  }
  function run<T>(request: () => Promise<T>, apply: (result: T) => void = () => {}) {
    return perform(false, request, apply)
  }
  function runWrite<T>(request: () => Promise<T>, apply: (result: T) => void = () => {}) {
    return perform(true, request, apply)
  }
  return { busy, failure, uncertain, run, runWrite }
}
export interface Operation<T> {
  operationId: string
  expectedRevision: number
  input: T
}
export function operation<T>(input: T, expectedRevision = 0): Operation<T> {
  return { operationId: crypto.randomUUID(), expectedRevision, input }
}
