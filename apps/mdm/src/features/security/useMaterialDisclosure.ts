import { onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { isRssApiError } from '@rss/api/mdm'
import { useMdm } from '../../context'
import type { MaterialAccessTarget } from './clients/materials'
/** Local display lifetime only; the existing app session remains the credential owner. */
export function useMaterialDisclosure() {
  const runtime = useMdm(),
    route = useRoute(),
    secret = ref<string | null>(null),
    expiresAt = ref<number | null>(null),
    busy = ref(false),
    failure = ref<string | null>(null)
  let generation = 0,
    disposed = false,
    timer: ReturnType<typeof setTimeout> | undefined
  function binding() {
    const s = runtime.session.state.value
    return s.status === 'authenticated' && s.tenant === runtime.tenant && s.identity && s.session
      ? { principal: s.identity.principalId, sessionId: s.session.id }
      : null
  }
  function clear() {
    generation++
    clearTimeout(timer)
    timer = undefined
    secret.value = null
    expiresAt.value = null
    busy.value = false
    failure.value = null
  }
  async function reveal(target: MaterialAccessTarget, request: { id: string; revision: number }) {
    clear()
    const bound = binding(),
      own = generation,
      startedAt = performance.now()
    if (disposed || !bound) {
      failure.value = 'disclosureUnavailable'
      return false
    }
    busy.value = true
    try {
      const result = await runtime.security.materials.reveal(
        target,
        {
          disclosureId: crypto.randomUUID(),
          request: request.id,
          expectedRevision: request.revision,
        },
        bound,
      )
      if (disposed || own !== generation || JSON.stringify(binding()) !== JSON.stringify(bound))
        return false
      const remaining = Math.min(
        result.expiresAt * 1000 - Date.now(),
        30_000 - Math.max(0, performance.now() - startedAt),
      )
      if (remaining <= 0) {
        failure.value = 'disclosureExpired'
        return false
      }
      secret.value = result.secret
      expiresAt.value = Date.now() + remaining
      timer = setTimeout(clear, remaining)
      return true
    } catch (error) {
      if (!disposed && own === generation)
        failure.value =
          isRssApiError(error) && error.status === 403
            ? 'disclosureDenied'
            : isRssApiError(error) && error.status === 409
              ? 'disclosureConsumed'
              : 'disclosureUnknown'
      return false
    } finally {
      if (!disposed && own === generation) busy.value = false
    }
  }
  watch(
    () => [
      route.fullPath,
      runtime.session.state.value.status,
      runtime.session.state.value.tenant,
      runtime.session.state.value.identity?.principalId,
      runtime.session.state.value.session?.id,
    ],
    clear,
    { flush: 'sync' },
  )
  window.addEventListener('pagehide', clear)
  onBeforeUnmount(() => {
    disposed = true
    clear()
    window.removeEventListener('pagehide', clear)
  })
  return { secret, expiresAt, busy, failure, reveal, clear }
}
