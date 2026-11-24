import { expect, it, vi } from 'vitest'
import { createRuleCatalog } from './group-rule-catalog'

it('shares a pending field page and cancels HTTP only after the final rule releases it', async () => {
  const fields = vi.fn(
    (_query, signal: AbortSignal) =>
      new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason))
      }),
  )
  const catalog = createRuleCatalog('current', true, fields, vi.fn())
  const a = new AbortController(),
    b = new AbortController()
  const done = Promise.allSettled([
    catalog.fields({ limit: 50 }, a.signal),
    catalog.fields({ limit: 50 }, b.signal),
  ])
  expect(fields).toHaveBeenCalledTimes(1)
  a.abort()
  expect(fields.mock.calls[0]?.[1].aborted).toBe(false)
  b.abort()
  expect(fields.mock.calls[0]?.[1].aborted).toBe(true)
  expect((await done).every((r) => r.status === 'rejected')).toBe(true)
})
