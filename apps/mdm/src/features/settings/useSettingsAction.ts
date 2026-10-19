import { computed, onBeforeUnmount, watch, ref } from 'vue'
import { useMdm } from '../../context'
import { useOperation } from '../../services/useOperation'

/** Page effects use the existing transport/session owner; only non-secret domain intent survives SPA navigation. */
export function useSettingsAction(target: () => string) {
  const runtime = useMdm(),
    operation = useOperation([], () => [
      runtime.session.state.value.status,
      runtime.session.state.value.tenant ?? undefined,
      runtime.session.state.value.identity?.principalId,
      runtime.session.state.value.session?.id,
    ]),
    store = runtime.settings.operations
  const compared = ref(false)
  const pending = computed(() => store.records.get(target()))
  watch(
    () => pending.value?.id,
    () => (compared.value = false),
    { flush: 'sync' },
  )
  const locked = computed(
    () =>
      operation.busy.value ||
      pending.value?.state === 'unknown' ||
      pending.value?.state === 'submitting' ||
      pending.value?.state === 'conflict',
  )
  async function submit<T>(
    action: string,
    revision: number,
    publicInput: Record<string, string | number | boolean | null>,
    request: (id: string) => Promise<T>,
    apply: (v: T) => void,
    replay = false,
  ) {
    const key = target(),
      intent = JSON.stringify(publicInput),
      previous = pending.value
    if (operation.busy.value || (!replay && locked.value)) return false
    if (
      replay &&
      (!previous?.queried ||
        previous.action !== action ||
        previous.expectedRevision !== revision ||
        previous.publicInput !== intent)
    ) {
      operation.failure.value = 'invalidRequest'
      return false
    }
    return operation.runWrite(
      () => store.submit(key, action, revision, intent, request, replay),
      apply,
    )
  }
  async function query<T>(id: string, request: () => Promise<T>, apply: (v: T) => void) {
    const key = target()
    const ok = await operation.run(request, (value) => {
      apply(value)
      store.confirm(key, id)
    })
    if (ok || operation.failure.value === 'notFound') store.queried(key, id)
    return ok
  }
  return {
    ...operation,
    pending,
    locked,
    submit,
    query,
    compared,
    markCompared: () => {
      compared.value = true
    },
    resolveConflict: () => {
      if (compared.value) store.resolveConflict(target())
    },
  }
}

/** The component supplies its secret fields explicitly; nothing is copied into a shared store. */
export function useSettingsSecrets(clear: () => void) {
  const runtime = useMdm()
  watch(
    () =>
      [
        runtime.session.state.value.status,
        runtime.session.state.value.tenant ?? undefined,
        runtime.session.state.value.identity?.principalId,
        runtime.session.state.value.session?.id,
      ].join('/'),
    clear,
    { flush: 'sync' },
  )
  const visibility = () => {
    if (document.visibilityState === 'hidden') clear()
  }
  document.addEventListener('visibilitychange', visibility)
  onBeforeUnmount(() => {
    clear()
    document.removeEventListener('visibilitychange', visibility)
  })
}

/** Revoked or changed authentication cannot leave a previous principal's settings visible. */
export function useSettingsFacts(clear: () => void) {
  const runtime = useMdm()
  watch(
    () =>
      [
        runtime.session.state.value.status,
        runtime.session.state.value.tenant,
        runtime.session.state.value.identity?.principalId,
        runtime.session.state.value.session?.id,
      ].join('/'),
    clear,
    { flush: 'sync' },
  )
}
