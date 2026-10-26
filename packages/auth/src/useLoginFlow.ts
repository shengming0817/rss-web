import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useIdentity } from './context'
import { useOperation } from './services/operation'
import { uuid } from './services/decode'

/** Shared authentication behavior; views own only their presentation. */
export function useLoginFlow() {
  const route = useRoute()
  const router = useRouter()
  const { session, api, flows, landingTarget, hostLogin: host } = useIdentity()
  const { busy, error, errorMessage, run, checkpoint } = useOperation()
  const tenant = ref('')
  const login = ref('')
  const password = ref('')
  const providers = ref<{ id: string; label: string }[]>([])
  async function continueFlow() {
    checkpoint()
    flows.clear()
    await router.replace(
      landingTarget?.(tenant.value) ?? { name: 'sessions', params: { tenant: tenant.value } },
    )
  }
  async function submit() {
    const secret = password.value
    password.value = ''
    await run(async () => {
      await session.login(tenant.value, login.value, secret)
      await continueFlow()
    })
  }
  async function sso(id: string) {
    await run(async () => {
      flows.save({ kind: 'sso', tenant: tenant.value })
      try {
        const location = await api.beginSso(tenant.value, id)
        checkpoint()
        window.location.assign(location)
      } catch (failure) {
        flows.clear()
        throw failure
      }
    })
  }
  onMounted(() => {
    void run(async () => {
      if (route.name === 'resume') {
        const pending = flows.take()
        if (!pending || !session.config.oidcEnabled) {
          await router.replace({ name: 'error' })
          return
        }
        tenant.value = pending.tenant
        if (host && tenant.value !== host.tenant) {
          await router.replace({ name: 'error' })
          return
        }
        await session.check(tenant.value)
        checkpoint()
        if (session.state.value.status !== 'authenticated') {
          await router.replace({ name: 'error' })
          return
        }
        await continueFlow()
        return
      }
      tenant.value = uuid(host?.tenant ?? route.params['tenant'])
      await session.check(tenant.value)
      checkpoint()
      if (session.config.oidcEnabled) {
        providers.value = await api.loginOptions(tenant.value)
        checkpoint()
      }
    })
  })
  onBeforeUnmount(() => {
    password.value = ''
  })
  return {
    session,
    host,
    tenant,
    login,
    password,
    providers,
    busy,
    error,
    errorMessage,
    submit,
    sso,
    continueFlow,
    run,
  }
}
