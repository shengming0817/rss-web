import { useSearchParams } from 'react-router-dom'
import type { Query } from './AdminUi'

export interface CatalogLocation {
  params: URLSearchParams
  setParams: (params: URLSearchParams) => void
  canWritePolicy: boolean
  canReadPolicy: boolean
  canReadRuns: boolean
}

export function catalogQuery(params: URLSearchParams, prefix = ''): Query {
  const limit = Number(params.get(prefix + 'limit') ?? 20)
  return {
    limit: Number.isSafeInteger(limit) && limit >= 1 && limit <= 1000 ? limit : 20,
    ...(params.get(prefix + 'filter') ? { filter: params.get(prefix + 'filter')! } : {}),
    ...(params.get(prefix + 'cursor') ? { cursor: params.get(prefix + 'cursor')! } : {}),
    ...(params.has(prefix + 'sort') ? { sort: params.getAll(prefix + 'sort') } : {}),
    ...(params.has(prefix + 'field') ? { fields: params.getAll(prefix + 'field') } : {}),
  }
}

export function writeCatalogQuery(params: URLSearchParams, query: Query, prefix = '') {
  const next = new URLSearchParams(params)
  for (const key of ['limit', 'filter', 'cursor', 'sort', 'field']) next.delete(prefix + key)
  if (query.limit) next.set(prefix + 'limit', String(query.limit))
  if (query.filter) next.set(prefix + 'filter', query.filter)
  if (query.cursor) next.set(prefix + 'cursor', query.cursor)
  query.sort?.forEach((field) => next.append(prefix + 'sort', field))
  query.fields?.forEach((field) => next.append(prefix + 'field', field))
  return next
}

export function useDirectoryQuery(
  prefix: string,
  initial: Query = { limit: 20 },
): readonly [Query, (query: Query) => void] {
  const [params, setParams] = useSearchParams()
  const hasQuery = ['filter', 'sort', 'field', 'limit', 'cursor'].some((key) =>
    params.has(prefix + key),
  )
  const query = hasQuery ? catalogQuery(params, prefix) : initial
  return [query, (next) => setParams((current) => writeCatalogQuery(current, next, prefix))]
}
