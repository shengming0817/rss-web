import { queryParameters, pageCursor, type DirectoryQuery } from '@rss/api/mdm-query'
import type { DirectoryLocation } from '../../services/directory'
export function readListLocation(values: Record<string, unknown>): DirectoryLocation {
  try {
    if (
      Object.keys(values).some(
        (key) => !['filter', 'sort', 'fields', 'limit', 'cursor', 'trail'].includes(key),
      )
    )
      throw new Error('Unsupported query parameter')
    const text = (key: string) => {
      const v = values[key]
      if (v === undefined) return undefined
      if (typeof v !== 'string') throw new Error('Invalid query parameter')
      return v
    }
    const query: DirectoryQuery = {
      filter: text('filter'),
      sort: text('sort')?.split(','),
      fields: text('fields')?.split(','),
      limit: text('limit') === undefined ? 50 : Number(text('limit')),
      cursor: text('cursor'),
    }
    queryParameters(query)
    if (query.limit! > 100) throw new Error('Invalid page size')
    const history = text('trail')
    const trail: (string | undefined)[] = history ? JSON.parse(history) : []
    if (!Array.isArray(trail) || trail.length > 1000) throw new Error('Invalid navigation')
    trail.forEach((v) => {
      if (v !== null) pageCursor(v)
    })
    return { query, trail: trail.map((v) => v ?? undefined) }
  } catch {
    return { query: {}, trail: [], error: '查询参数已失效，请重新应用查询。' }
  }
}
export function listLocation(query: DirectoryQuery, trail: (string | undefined)[]) {
  return {
    ...Object.fromEntries(
      Object.entries(queryParameters(query)).map(([key, value]) => [key, String(value)]),
    ),
    ...(trail.length ? { trail: JSON.stringify(trail.map((v) => v ?? null)) } : {}),
  }
}
