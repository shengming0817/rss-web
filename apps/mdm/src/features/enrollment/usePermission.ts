import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useMdm } from '../../context'
import type { Permission } from '../operations/clients/authorization'
/** This display projection is read from the authoritative existing endpoint on each binding. */
export function usePermission(read: Permission, write: Permission) {
  const runtime = useMdm(),
    grants = ref<Permission[]>([]),
    loading = ref(false)
  let generation = 0
  async function refresh() {
    const own = ++generation
    grants.value = []
    loading.value = true
    const state = runtime.session.state.value
    if (state.status !== 'authenticated' || state.tenant !== runtime.tenant) {
      loading.value = false
      return
    }
    try {
      const value = await runtime.operations.authorization.effective()
      if (own === generation && value.principalId === state.identity?.principalId)
        grants.value = value.grants.filter((g) => g.scope.kind === 'tenant').map((g) => g.operation)
    } catch {
      /* No authority is inferred from failed reads. */
    } finally {
      if (own === generation) loading.value = false
    }
  }
  watch(
    () => [
      runtime.session.state.value.status,
      runtime.session.state.value.tenant,
      runtime.session.state.value.identity?.principalId,
      runtime.session.state.value.session?.id,
    ],
    () => {
      void refresh()
    },
    { immediate: true, flush: 'sync' },
  )
  onBeforeUnmount(() => {
    generation++
    grants.value = []
  })
  return {
    canRead: computed(() => grants.value.includes(read)),
    canWrite: computed(() => grants.value.includes(write)),
    loading,
    refresh,
  }
}
