import { reactive, ref, shallowRef, watch, computed, type WatchSource } from 'vue'
import type { DirectoryQuery } from '@rss/api/mdm-query'
import { allOf, queryParameters } from '@rss/api/mdm-query'
import type { DirectoryPage } from '@rss/device-access/model'
import { useDa, identityKey } from '../context'
import { useRead } from './read'
export interface DirectoryLocation {
  query: DirectoryQuery
  trail: (string | undefined)[]
  error?: string | undefined
}
/** The existing read owner fences responses; this object owns accepted page navigation only. */
export function useDirectory<T>(
  columns: readonly string[],
  maximum: number,
  fetch: (query: DirectoryQuery, signal: AbortSignal) => Promise<DirectoryPage<T>>,
  scope: WatchSource = () => '',
  initial?: DirectoryLocation,
  fixed: () => DirectoryQuery = () => ({}),
) {
  const runtime = useDa()
  const draft = reactive({
    filter: initial?.query.filter ?? '',
    sort: initial?.query.sort?.join(',') ?? '',
    fields: [...(initial?.query.fields ?? columns)],
    limit: initial?.query.limit ?? 50,
  })
  const applied = shallowRef<DirectoryQuery>(),
    cursor = ref<string>(),
    trail = ref<(string | undefined)[]>([]),
    next = ref<string | null>(null)
  type Attempt = { query: DirectoryQuery; trail: (string | undefined)[] }
  let candidate: Attempt | undefined = initial
    ? { query: initial.query, trail: initial.trail }
    : undefined
  let attempt: Attempt | undefined,
    initialError = initial?.error
  function reset() {
    candidate = undefined
    attempt = undefined
    applied.value = undefined
    cursor.value = undefined
    trail.value = []
    next.value = null
    reader?.reset()
  }
  watch([() => identityKey(runtime.session), scope], reset, { flush: 'sync' })
  function snapshot(): DirectoryQuery {
    if (
      !draft.fields.length ||
      draft.fields.some((field) => !columns.includes(field)) ||
      draft.limit > maximum
    )
      throw new Error('Invalid query')
    const base = fixed()
    const query: DirectoryQuery = {
      filter: allOf(base.filter, draft.filter.trim() || undefined),
      sort: draft.sort.trim() ? draft.sort.split(',').map((v) => v.trim()) : base.sort,
      fields:
        columns.length > 16 &&
        draft.fields.length === columns.length &&
        columns.every((field) => draft.fields.includes(field))
          ? undefined
          : [...draft.fields],
      limit: draft.limit,
    }
    queryParameters(query)
    return query
  }
  const reader = useRead(
    async (signal) => {
      if (initialError) throw new Error(initialError)
      const request = candidate ?? attempt ?? { query: snapshot(), trail: [] }
      candidate = undefined
      attempt = request
      return fetch(request.query, signal)
    },
    scope,
    {
      accepted(value) {
        if (!attempt) return
        if (
          value.nextCursor &&
          (value.nextCursor === attempt.query.cursor || attempt.trail.includes(value.nextCursor))
        )
          throw new Error('Repeated cursor')
        applied.value = { ...attempt.query, cursor: undefined }
        cursor.value = attempt.query.cursor
        trail.value = [...attempt.trail]
        next.value = value.nextCursor
      },
    },
  )
  function run(query: DirectoryQuery, history: (string | undefined)[]) {
    if (reader!.busy.value) return
    initialError = undefined
    candidate = { query, trail: history }
    return reader!.reload()
  }
  function apply() {
    if (reader!.busy.value) return
    initialError = undefined
    candidate = undefined
    attempt = undefined
    return reader.reload()
  }
  function first() {
    return applied.value ? run(applied.value, []) : apply()
  }
  function previous() {
    if (!trail.value.length) return
    return run({ ...applied.value, cursor: trail.value.at(-1) }, trail.value.slice(0, -1))
  }
  function following() {
    if (!next.value) return
    return run({ ...applied.value, cursor: next.value }, [...trail.value, cursor.value])
  }
  function restore(location: DirectoryLocation) {
    reset()
    Object.assign(draft, {
      filter: location.query.filter ?? '',
      sort: location.query.sort?.join(',') ?? '',
      fields: [...(location.query.fields ?? columns)],
      limit: location.query.limit ?? 50,
    })
    initialError = location.error
    candidate = { query: location.query, trail: location.trail }
    return reader!.reload()
  }
  return {
    ...reader,
    updateDraft: (values: Partial<typeof draft>) => Object.assign(draft, values),
    draft,
    columns,
    maximum,
    applied,
    cursor,
    trail,
    next,
    apply,
    first,
    previous,
    following,
    restore,
    projectionComplete: computed(() =>
      columns.every((field) => applied.value?.fields?.includes(field) ?? true),
    ),
  }
}
export type DirectoryNavigation = Pick<
  ReturnType<typeof useDirectory>,
  | 'updateDraft'
  | 'draft'
  | 'columns'
  | 'maximum'
  | 'trail'
  | 'next'
  | 'apply'
  | 'first'
  | 'previous'
  | 'following'
>
