import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { isRssApiError } from '@rss/api/identity'
export function useOperation() {
  const busy = ref(false)
  const error = ref('')
  const retryAt = ref<number>()
  const { t, locale } = useI18n()
  const errorMessage = computed(() => {
    if (!error.value) return ''
    const params =
      retryAt.value === undefined
        ? {}
        : {
            time: new Intl.DateTimeFormat(locale.value, {
              dateStyle: 'short',
              timeStyle: 'medium',
            }).format(retryAt.value),
          }
    return t(`identity.errors.${error.value}`, params)
  })
  let generation = 0
  function invalidate() {
    generation++
    busy.value = false
    error.value = ''
    retryAt.value = undefined
  }
  let active = true
  onBeforeUnmount(() => {
    active = false
  })
  async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
    if (busy.value) return undefined
    const own = generation
    busy.value = true
    error.value = ''
    retryAt.value = undefined
    try {
      const result = await work()
      return active && own === generation ? result : undefined
    } catch (failure) {
      if (active && own === generation) {
        error.value =
          isRssApiError(failure) && failure.cause === 'wire' ? failure.code : 'unknown_result'
        if (
          isRssApiError(failure) &&
          failure.cause === 'wire' &&
          failure.code === 'rate_limited' &&
          failure.retryAfterSeconds !== undefined
        )
          retryAt.value = Date.now() + failure.retryAfterSeconds * 1000
      }
      return undefined
    } finally {
      if (active && own === generation) busy.value = false
    }
  }
  function checkpoint() {
    if (!active) throw new Error('Operation abandoned')
  }
  return { busy, error, errorMessage, run, checkpoint, invalidate }
}
