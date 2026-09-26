import { createHash, randomUUID } from 'node:crypto'
import type { DemoRequest, Reply } from './scenario'
import { closed, count, uuid } from '../src/services/decode'
export const ok = (body: unknown, status = 200): Reply => ({ status, body })
export const error = (code: string, status = 409): Reply => ({ status, body: { code } })
export function operation(value: unknown) {
  const v = closed(value, ['operationId', 'expectedRevision', 'input'])
  return {
    operationId: uuid(v['operationId']),
    expectedRevision: count(v['expectedRevision']),
    input: v['input'],
  }
}
/** Server-side immutable demo pages, opaque cursors scoped to the exact projection. */
export function createPages() {
  const cursors = new Map<string, { key: string; snapshot: string; remaining: unknown[] }>()
  return {
    reset: () => cursors.clear(),
    page<T>(key: string, items: T[], query: URLSearchParams, snapshot: string = randomUUID()) {
      const limit = Number(query.get('limit') ?? '20')
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Invalid limit')
      let remaining = structuredClone(items)
      const cursor = query.get('cursor')
      if (cursor) {
        const old = cursors.get(cursor)
        if (!old || old.key !== key) throw new Error('Invalid cursor')
        remaining = structuredClone(old.remaining) as T[]
        snapshot = old.snapshot
      }
      const page = remaining.slice(0, limit)
      const nextCursor = remaining.length > limit ? randomUUID() : null
      if (nextCursor) cursors.set(nextCursor, { key, snapshot, remaining: remaining.slice(limit) })
      // Demo cursors permit exact GET retries within a bounded recent-page cache.
      while (cursors.size > 256) cursors.delete(cursors.keys().next().value!)
      return { items: page, nextCursor, snapshot }
    },
  }
}
/** Exact idempotent replay is owned by this synthetic HTTP server, never the browser. */
export function createReceipts() {
  const receipts = new Map<string, { digest: string; reply: Reply }>()
  return {
    reset: () => receipts.clear(),
    write(request: DemoRequest, key: string, action: () => Reply) {
      uuid(key)
      const digest = createHash('sha256')
        .update(
          JSON.stringify([request.actor.principalId, request.method, request.path, request.body]),
        )
        .digest('hex')
      const old = receipts.get(key)
      if (old)
        return old.digest === digest ? structuredClone(old.reply) : error('operation_conflict')
      const reply = action()
      if (reply.status >= 200 && reply.status < 300)
        receipts.set(key, { digest, reply: structuredClone(reply) })
      return reply
    },
  }
}
