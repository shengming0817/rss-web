import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useIdentity } from './context'
import { useOperation } from './services/operation'
import type { Account } from './services/decode'
export function useAccounts() {
  const { api, session } = useIdentity()
  const { busy, error, errorMessage, run, checkpoint } = useOperation()
  const rows = ref<Account[]>([])
  const loaded = ref(false)
  const next = ref<string | null>(null)
  const login = ref('')
  const password = ref('')
  const resetPassword = ref('')
  const creating = ref(false)
  function closeCreate() {
    creating.value = false
    password.value = ''
  }
  onBeforeUnmount(() => {
    password.value = ''
    resetPassword.value = ''
  })
  const profileTarget = ref<Account | null>(null)
  const resetTarget = ref<Account | null>(null)
  const pending = ref<{
    account: Account
    field: 'enabled' | 'membership'
    enabled: boolean
  } | null>(null)
  watch(
    () => [
      session.state.value.status,
      session.state.value.tenant,
      session.state.value.identity?.principalId,
      session.state.value.session?.id,
    ],
    () => {
      rows.value = []
      loaded.value = false
      next.value = null
      login.value = ''
      closeCreate()
      closeReset()
      profileTarget.value = null
      pending.value = null
    },
    { flush: 'sync' },
  )
  async function load(cursor?: string) {
    const value = await api.accounts(cursor)
    checkpoint()
    rows.value = cursor ? [...rows.value, ...value.accounts] : value.accounts
    next.value = value.next
    loaded.value = true
  }
  onMounted(() => {
    if (session.managementHint.value) void run(() => load())
  })
  async function create() {
    const secret = password.value
    password.value = ''
    await run(async () => {
      await api.createAccount(login.value, secret)
      login.value = ''
      closeCreate()
      await load()
    })
  }
  async function confirm() {
    const v = pending.value
    pending.value = null
    if (v)
      await run(async () => {
        await api.setAccount(v.account, v.field, v.enabled)
        if (session.state.value.status === 'authenticated') await load()
      })
  }
  function openReset(account: Account) {
    closeCreate()
    resetPassword.value = ''
    resetTarget.value = account
  }
  function closeReset() {
    resetTarget.value = null
    resetPassword.value = ''
  }
  async function reset() {
    const target = resetTarget.value
    const secret = resetPassword.value
    resetTarget.value = null
    resetPassword.value = ''
    if (target)
      await run(async () => {
        await api.resetPassword(target.principalId, secret)
        await load()
      })
  }

  return {
    api,
    session,
    busy,
    error,
    errorMessage,
    run,
    rows,
    loaded,
    next,
    login,
    password,
    resetPassword,
    creating,
    closeCreate,
    profileTarget,
    resetTarget,
    pending,
    load,
    create,
    confirm,
    openReset,
    closeReset,
    reset,
  }
}
