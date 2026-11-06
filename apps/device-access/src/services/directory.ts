import { useRef, useState } from 'react'
import { allOf, queryParameters, type DirectoryQuery } from '@rss/api/mdm-query'
import type { DirectoryPage } from '@rss/device-access/model'
import { useRead } from './read'
import { identityKey, useDa, useIdentity } from '../context'
export interface DirectoryLocation {
  query: DirectoryQuery
  trail: (string | undefined)[]
  error?: string | undefined
}
export function useDirectory<T>(
  columns: readonly string[],
  maximum: number,
  fetch: (query: DirectoryQuery, signal: AbortSignal) => Promise<DirectoryPage<T>>,
  scope = '',
  initial?: DirectoryLocation,
  fixed: DirectoryQuery = {},
) {
  const runtime = useDa()
  useIdentity()
  const boundScope = `${identityKey(runtime.session)}/${scope}`
  const [draft, setDraft] = useState({
    filter: initial?.query.filter ?? '',
    sort: initial?.query.sort?.join(',') ?? '',
    fields: [...(initial?.query.fields ?? columns)],
    limit: initial?.query.limit ?? 50,
  })
  const [accepted, setAccepted] = useState<DirectoryLocation | undefined>()
  const attempt = useRef<DirectoryLocation | undefined>(initial),
    candidate = useRef<DirectoryLocation | undefined>(initial),
    initialError = useRef(initial?.error)
  const previousScope = useRef(boundScope)
  if (previousScope.current !== boundScope) {
    previousScope.current = boundScope
    attempt.current = undefined
    candidate.current = undefined
    initialError.current = undefined
    if (accepted) setAccepted(undefined)
  }
  function snapshot(): DirectoryQuery {
    if (
      !draft.fields.length ||
      draft.fields.some((f) => !columns.includes(f)) ||
      draft.limit > maximum
    )
      throw new Error('Invalid query')
    const query: DirectoryQuery = {
      filter: allOf(fixed.filter, draft.filter.trim() || undefined),
      sort: draft.sort.trim() ? draft.sort.split(',').map((s) => s.trim()) : fixed.sort,
      fields:
        columns.length > 16 && draft.fields.length === columns.length
          ? undefined
          : [...draft.fields],
      limit: draft.limit,
    }
    queryParameters(query)
    return query
  }
  const reader = useRead(async (signal) => {
    if (initialError.current) throw new Error(initialError.current)
    const request = candidate.current ?? attempt.current ?? { query: snapshot(), trail: [] }
    candidate.current = undefined
    attempt.current = request
    const value = await fetch(request.query, signal)
    if (
      value.nextCursor &&
      (value.nextCursor === request.query.cursor || request.trail.includes(value.nextCursor))
    )
      throw new Error('Repeated cursor')
    return { value, request }
  }, boundScope)
  // Commit accepted navigation only from the response already fenced by useRead.
  if (reader.data && reader.data.request !== accepted) setAccepted(reader.data.request)
  const data = reader.data?.value
  const navigate = (location: DirectoryLocation) => {
    if (reader.busy) return
    initialError.current = undefined
    candidate.current = location
    return reader.reload()
  }
  const applied = accepted?.query
  const apply = () => {
    if (reader.busy) return
    initialError.current = undefined
    candidate.current = undefined
    attempt.current = undefined
    return reader.reload()
  }
  return {
    ...reader,
    data,
    draft,
    updateDraft: (value: Partial<typeof draft>) => setDraft((v) => ({ ...v, ...value })),
    columns,
    maximum,
    applied,
    trail: accepted?.trail ?? [],
    cursor: applied?.cursor,
    next: data?.nextCursor ?? null,
    apply,
    first: () =>
      applied ? navigate({ query: { ...applied, cursor: undefined }, trail: [] }) : apply(),
    previous: () =>
      accepted?.trail.length
        ? navigate({
            query: { ...applied, cursor: accepted.trail.at(-1) },
            trail: accepted.trail.slice(0, -1),
          })
        : undefined,
    following: () =>
      data?.nextCursor
        ? navigate({
            query: { ...applied, cursor: data.nextCursor },
            trail: [...(accepted?.trail ?? []), applied?.cursor],
          })
        : undefined,
    restore: (location: DirectoryLocation) => {
      candidate.current = location
      attempt.current = undefined
      initialError.current = location.error
      setDraft({
        filter: location.query.filter ?? '',
        sort: location.query.sort?.join(',') ?? '',
        fields: [...(location.query.fields ?? columns)],
        limit: location.query.limit ?? 50,
      })
      return reader.reload()
    },
    projectionComplete: columns.every((field) => applied?.fields?.includes(field) ?? true),
  }
}
