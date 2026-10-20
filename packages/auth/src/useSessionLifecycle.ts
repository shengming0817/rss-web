import { watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useIdentity, loginTarget } from './context'
export function useSessionLifecycle() {
  const { session, hostLogin: host } = useIdentity()
  const router = useRouter()
  const { locale } = useI18n()
  watch(
    locale,
    (value) => {
      document.documentElement.lang = value
    },
    { immediate: true },
  )
  onMounted(() => {
    window.addEventListener('pagehide', session.leavePage)
    document.addEventListener('pointerdown', activity, true)
    document.addEventListener('keydown', activity, true)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('pagehide', session.leavePage)
    document.removeEventListener('pointerdown', activity, true)
    document.removeEventListener('keydown', activity, true)
  })
  watch(
    () => [session.state.value.status, session.logoutOutcome.value] as const,
    ([status, logoutOutcome]) => {
      // The session page owns the pending/unknown departure message, not authority.
      if (router.currentRoute.value.name === 'sessions' && logoutOutcome !== 'idle') return
      if (
        router.currentRoute.value.meta['protected'] &&
        status !== 'authenticated' &&
        status !== 'checking'
      )
        void router.replace(
          status === 'unavailable'
            ? {
                name: 'error',
                query: {
                  reason: 'unavailable',
                  tenant: session.state.value.tenant,
                },
              }
            : host
              ? { name: 'login', query: router.currentRoute.value.query }
              : loginTarget(session.state.value.tenant),
        )
    },
  )
  function activity(event: Event) {
    if (event.isTrusted) void session.activity().catch(() => undefined)
  }
}
