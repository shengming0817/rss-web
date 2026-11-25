import { expect, it, vi } from 'vitest'
import {
  createRuleCatalog,
  currentFields,
  registrationFields,
  usableCriteria,
} from './group-rule-catalog'

it('shares a pending field page and cancels HTTP only after the final rule releases it', async () => {
  const fields = vi.fn(
    (_query, signal: AbortSignal) =>
      new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason))
      }),
  )
  const catalog = createRuleCatalog('current', true, true, fields, vi.fn())
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

it('requires a selected personnel field and its effective permission throughout nested rules', () => {
  const policy = createRuleCatalog('restricted', true, false, vi.fn(), vi.fn())
  const predicate = (field: string) => ({
    kind: 'predicate' as const,
    field,
    op: 'is_null' as const,
  })
  expect(usableCriteria(predicate(registrationFields), policy)).toBe(false)
  expect(usableCriteria(predicate(registrationFields + 'principal_id'), policy)).toBe(true)
  expect(
    usableCriteria(
      { kind: 'and', children: [predicate(currentFields + 'local_group_ids')] },
      policy,
    ),
  ).toBe(false)
})
