import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useIdentity, loginTarget } from './context'
import { useOperation } from './services/operation'
import type { Session } from './services/decode'
export function useAccountSecurity() {
  const router = useRouter()
  const { session, api, flows, hostLogin: host } = useIdentity()
  const { busy, error, errorMessage, run, checkpoint } = useOperation()
  const rows = ref<Session[]>([])
  const next = ref<string | null>(null)
  const current = ref('')
  const tab = ref('sessions'),
    confirmAll = ref(false)
  function clearLocalSecrets() {
    password.value = ''
    current.value = ''
    reauthPassword.value = ''
    linkPassword.value = ''
  }
  function clearClosedSecrets(event: Event) {
    if (!(event.target as HTMLDetailsElement).open) clearLocalSecrets()
  }
  watch(tab, clearLocalSecrets)
  const password = ref('')
  const reauthPassword = ref('')
  const linkPassword = ref('')
  const providers = ref<{ id: string; label: string }[]>([])
  const selectedProvider = ref('')
  const owner = computed(() =>
    session.state.value.status === 'authenticated'
      ? [
          session.state.value.tenant,
          session.state.value.identity?.principalId,
          session.state.value.session?.id,
        ].join('/')
      : null,
  )
  let generation = 0
  let reload = true
  watch(
    owner,
    () => {
      generation++
      rows.value = []
      next.value = null
      current.value = ''
      password.value = ''
      reauthPassword.value = ''
      linkPassword.value = ''
      providers.value = []
      selectedProvider.value = ''
      confirmAll.value = false
      reload = true
    },
    { flush: 'sync' },
  )
  watch(
    [owner, busy],
    () => {
      if (!owner.value || busy.value || !reload) return
      reload = false
      void run(async () => {
        await load()
        await session.loadSecurity()
        if (session.config.oidcEnabled && session.state.value.tenant)
          providers.value = await api.loginOptions(session.state.value.tenant)
      })
    },
    { immediate: true },
  )
  async function load(cursor?: string) {
    const expected = generation
    const value = await api.sessions(cursor)
    checkpoint()
    if (generation !== expected) throw new Error('Stale session page')
    rows.value = cursor ? [...rows.value, ...value.sessions] : value.sessions
    next.value = value.next
  }
  async function checkSession() {
    const tenant = session.state.value.tenant
    if (tenant) {
      await session.check(tenant)
      checkpoint()
    }
  }
  async function reloadSessions() {
    if (owner.value) await load()
    else await checkSession()
  }
  onMounted(() => {
    document.addEventListener('visibilitychange', visible)
  })
  onBeforeUnmount(() => document.removeEventListener('visibilitychange', visible))
  function visible() {
    if (document.visibilityState !== 'visible') clearLocalSecrets()
    else if (!busy.value) void run(checkSession)
  }
  watch(
    () => session.state.value.session,
    (value, previous) => {
      if (value && previous && value !== previous && !busy.value)
        void run(() => session.loadSecurity())
    },
  )
  async function change() {
    const old = current.value
    const value = password.value
    current.value = ''
    password.value = ''
    await run(async () => {
      await api.ownPassword(old, value)
      flows.clear()
      await router.replace(loginTarget(session.state.value.tenant, host))
    })
  }
  async function logout(all: boolean) {
    const tenant = session.state.value.tenant
    flows.clear()
    await run(async () => {
      await session.logout(all)
      checkpoint()
      await router.replace(loginTarget(tenant, host))
    })
  }
  async function reauthenticate() {
    const value = reauthPassword.value
    reauthPassword.value = ''
    await run(() => session.reauthenticate(value))
  }
  async function link() {
    const tenant = session.state.value.tenant
    const value = session.state.value.identity?.hasLocalPassword ? linkPassword.value : null
    linkPassword.value = ''
    if (!tenant) return
    await run(async () => {
      flows.save({ kind: 'link', tenant })
      try {
        const location = await api.link(selectedProvider.value, value)
        checkpoint()
        window.location.assign(location)
      } catch (failure) {
        flows.clear()
        throw failure
      }
    })
  }
  onBeforeUnmount(clearLocalSecrets)
  function submitConfirmed() {
    confirmAll.value = false
    void logout(true)
  }

  return {
    session,
    host,
    busy,
    error,
    errorMessage,
    run,
    rows,
    next,
    current,
    tab,
    confirmAll,
    clearLocalSecrets,
    clearClosedSecrets,
    password,
    reauthPassword,
    linkPassword,
    providers,
    selectedProvider,
    owner,
    load,
    reloadSessions,
    change,
    logout,
    reauthenticate,
    link,
    submitConfirmed,
    loginTarget,
  }
}
