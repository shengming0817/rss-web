import { TENANT } from '../scenario'
import { createPages, ok } from '../http'
export const candidate = (body: object, status = 200) =>
  ok({ contract: 'security-v1', tenantId: TENANT, source: 'mock', ...body }, status)
export function queryKeys(query: URLSearchParams, allowed: string[]) {
  const keys = [...query.keys()]
  if (keys.some((k) => !allowed.includes(k)) || new Set(keys).size !== keys.length)
    throw new Error('Invalid security query')
  const limit = Number(query.get('limit') ?? '20')
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid page size')
}
/** Expiring governance pages retain the snapshot's time, not the time of a later cursor read. */
export function createSecurityPages(now: () => number) {
  const pages = createPages(),
    times = new Map<string, number>()
  return {
    page<T>(key: string, items: T[], query: URLSearchParams) {
      const page = pages.page(key, items, query)
      if (!times.has(page.snapshot)) {
        if (query.has('cursor')) throw new Error('Expired security page')
        times.set(page.snapshot, now())
      }
      while (times.size > 256) times.delete(times.keys().next().value!)
      return { ...page, asOf: times.get(page.snapshot)! }
    },
    reset() {
      pages.reset()
      times.clear()
    },
  }
}
