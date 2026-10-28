import { reactive, computed, ref, watch, onBeforeUnmount } from 'vue'
import { useIdentity } from './context'
import { useOperation } from './services/operation'
import {
  accountBaseFields,
  type AccountRow,
  type AccountQuery,
  type AccountField,
} from './services/account-query'

/** Account query state belongs to auth; applications supply their own presentation and permissions. */
export function useAccountDirectory() {
  const { api, session } = useIdentity()
  const operation = useOperation()
  const { checkpoint } = operation
  const rows = ref<(AccountRow & { principalId: string })[]>([])
  const query = reactive({
    filter: '',
    sort: '',
    fields: [...accountBaseFields] as AccountField[],
    limit: 50,
    source: 'local',
  })
  const applied = ref<AccountQuery>()
  const trail = ref<(string | undefined)[]>([])
  const previous = computed(() => trail.value.at(-1))
  let generation = 0
  let navigating = false
  function navigate(after?: string) {
    navigating = true
    return load(after)
  }
  const loaded = ref(false)
  const next = ref<string | null>(null)
  let acceptedCursor: string | undefined
  function clear() {
    generation++
    navigating = false
    operation.invalidate()
    applied.value = undefined
    trail.value = []
    acceptedCursor = undefined
    rows.value = []
    loaded.value = false
    next.value = null
  }
  watch(
    () =>
      JSON.stringify([
        session.state.value.status,
        session.state.value.tenant,
        session.state.value.identity?.principalId,
        session.state.value.session?.id,
      ]),
    clear,
    { flush: 'sync' },
  )
  let allowed = session.managementHint.value
  watch(
    () =>
      JSON.stringify([
        session.state.value.navigation,
        session.state.value.navigation === 'ready' ? session.managementHint.value : null,
      ]),
    () => {
      generation++
      operation.invalidate()
      if (session.state.value.navigation === 'ready') {
        const current = session.managementHint.value
        if (current !== allowed) clear()
        allowed = current
      }
    },
    { flush: 'sync' },
  )
  onBeforeUnmount(clear)
  async function load(cursor?: string) {
    const expected = generation
    const selection: AccountQuery =
      (cursor !== undefined || navigating) && applied.value
        ? applied.value
        : {
            filter: query.filter.trim() || undefined,
            sort: query.sort.trim() ? query.sort.split(',').map((v) => v.trim()) : undefined,
            fields: [...new Set(['principalId' as const, ...query.fields])],
            source: query.source,
            limit: query.limit,
          }
    navigating = false
    try {
      const value = await api.accounts({ ...selection, cursor })
      checkpoint()
      if (expected !== generation) return
      if (value.next && (value.next === cursor || trail.value.includes(value.next)))
        throw new Error('Repeated account cursor')
      const position = trail.value.lastIndexOf(cursor)
      trail.value =
        cursor === undefined
          ? []
          : cursor === acceptedCursor
            ? [...trail.value]
            : position >= 0
              ? trail.value.slice(0, position)
              : [...trail.value, currentCursor()]
      rows.value = value.accounts.map((row) => {
        if (!row.principalId) throw new Error('Missing account locator')
        return { ...row, principalId: row.principalId }
      })
      next.value = value.next
      applied.value = selection
      acceptedCursor = cursor
      loaded.value = true
    } catch (failure) {
      if (expected === generation) rows.value = []
      throw failure
    }
  }
  function currentCursor() {
    return acceptedCursor
  }
  async function detail(row: { principalId: string }) {
    const expected = generation
    const value = await api.account(row.principalId)
    checkpoint()
    if (expected !== generation) throw new Error('Stale account')
    return value
  }
  return {
    api,
    session,
    ...operation,
    rows,
    query,
    applied,
    trail,
    previous,
    loaded,
    next,
    navigate,
    load,
    detail,
    clear,
  }
}
