import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useAccountDirectory } from './useAccountDirectory'
import type { Account } from './services/decode'
export function useAccounts() {
  const directory = useAccountDirectory()
  const {
    api,
    session,
    run,
    detail,
    load,
    busy,
    error,
    errorMessage,
    rows,
    loaded,
    next,
    query,
    applied,
    trail,
    previous,
    navigate,
  } = directory
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
    [
      () => session.state.value.status,
      () => session.state.value.tenant,
      () => session.state.value.identity?.principalId,
      () => session.state.value.session?.id,
      () => session.managementHint.value,
      () => session.state.value.navigation,
    ],
    () => {
      login.value = ''
      closeCreate()
      closeReset()
      profileTarget.value = null
      pending.value = null
    },
    { flush: 'sync' },
  )
  function openChange(row: { principalId: string }, field: 'enabled' | 'membership') {
    return run(async () => {
      const account = await detail(row)
      pending.value = {
        account,
        field,
        enabled: !(field === 'enabled' ? account.enabled : account.memberActive),
      }
    })
  }
  function openProfile(row: { principalId: string }) {
    return run(async () => {
      profileTarget.value = await detail(row)
    })
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
  function openReset(row: { principalId: string }) {
    return run(async () => {
      const account = await detail(row)
      if (!account.hasLocalPassword) return
      closeCreate()
      resetPassword.value = ''
      resetTarget.value = account
    })
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
    query,
    applied,
    trail,
    previous,
    navigate,
    openChange,
    openProfile,
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
