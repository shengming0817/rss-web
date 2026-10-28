import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch, type WatchSource } from 'vue'
import { useRoute } from 'vue-router'
import { useMdm } from '../context'
import { deviceBinding } from '../features/devices/useDeviceBinding'
import { allOf, queryParameters, type DirectoryQuery } from '@rss/api/mdm-query'

/** Page-local navigation only; requests and uncertain writes stay with their existing owner. */
export function useDirectoryQuery<const F extends string>(columns: readonly F[], maximum = 1000) {
  const runtime = useMdm()
  const route = useRoute()
  const draft = reactive({ filter: '', sort: '', fields: [...columns] as string[], limit: 50 })
  const applied = shallowRef<DirectoryQuery<F>>()
  const cursor = ref<string>()
  const trail = ref<(string | undefined)[]>([])
  const next = ref<string | null>(null)
  let pending: { query: DirectoryQuery<F>; trail: (string | undefined)[] } | undefined
  let epoch = 0
  let navigating = false
  const clears: (() => void)[] = []
  function navigate() {
    navigating = true
  }
  function continues(after?: string) {
    return (after !== undefined || navigating) && applied.value !== undefined
  }
  function onClear(clear: () => void) {
    clears.push(clear)
  }
  function restrict(source: WatchSource<boolean>) {
    watch(
      source,
      (allowed) => {
        if (!allowed) reset()
      },
      { flush: 'sync' },
    )
  }
  function bind(source: WatchSource<unknown>) {
    watch(source, reset, { flush: 'sync' })
  }
  function reset() {
    epoch++
    navigating = false
    clears.forEach((clear) => clear())
    applied.value = undefined
    cursor.value = undefined
    trail.value = []
    next.value = null
    pending = undefined
  }
  watch(() => JSON.stringify([route.fullPath, deviceBinding(runtime)]), reset, { flush: 'sync' })
  onBeforeUnmount(reset)
  function request(after?: string, fixed: DirectoryQuery<F> = {}): DirectoryQuery<F> {
    const base: DirectoryQuery<F> =
      continues(after) && applied.value
        ? applied.value
        : {
            filter: allOf(fixed.filter, draft.filter.trim() || undefined),
            sort: draft.sort.trim() ? draft.sort.split(',').map((v) => v.trim()) : fixed.sort,
            fields:
              columns.length > 16 &&
              columns.every((field) => draft.fields.includes(field)) &&
              draft.fields.length === columns.length
                ? undefined
                : ([...draft.fields] as F[]),
            limit: draft.limit,
          }
    if (
      (base.fields !== undefined &&
        (!base.fields.length || base.fields.some((v) => !columns.includes(v as F)))) ||
      base.limit! > maximum
    )
      throw new Error('Invalid query')
    navigating = false
    clears.forEach((clear) => clear())
    const query = { ...base, cursor: after }
    queryParameters(query)
    const position = trail.value.lastIndexOf(after)
    pending = {
      query,
      trail:
        after === undefined
          ? []
          : after === cursor.value
            ? [...trail.value]
            : position >= 0
              ? trail.value.slice(0, position)
              : [...trail.value, cursor.value],
    }
    return query
  }
  function accept(after: string | undefined, following: string | null) {
    if (!pending || pending.query.cursor !== after) return
    applied.value = { ...pending.query, cursor: undefined }
    trail.value = pending.trail
    cursor.value = after
    next.value = following
    pending = undefined
  }
  async function read<T extends { nextCursor: string | null }>(
    after: string | undefined,
    fetch: (query: DirectoryQuery<F>) => Promise<T>,
    fixed: DirectoryQuery<F> = {},
  ) {
    const query = request(after, fixed),
      expected = pending,
      own = epoch
    const result = await fetch(query)
    if (own !== epoch || pending !== expected) throw new Error('Stale directory page')
    if (
      result.nextCursor !== null &&
      (result.nextCursor === after || trail.value.includes(result.nextCursor))
    )
      throw new Error('Repeated directory cursor')
    accept(after, result.nextCursor)
    return result
  }
  const complete = computed(() =>
    columns.every((field) => applied.value?.fields?.includes(field) ?? true),
  )
  // Empty previous cursor denotes the successfully accepted first page.
  const previous = computed(() => trail.value.at(-1))
  return {
    updateDraft: (values: Partial<typeof draft>) => Object.assign(draft, values),
    draft,
    columns,
    maximum,
    applied,
    cursor,
    trail,
    next,
    previous,
    request,
    accept,
    read,
    complete,
    reset,
    navigate,
    continues,
    onClear,
    bind,
    restrict,
    epoch: () => epoch,
  }
}
export type DirectoryNavigation = Pick<
  ReturnType<typeof useDirectoryQuery<string>>,
  'updateDraft' | 'draft' | 'columns' | 'maximum' | 'trail' | 'next' | 'previous' | 'navigate'
>
