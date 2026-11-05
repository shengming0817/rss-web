import { expect, it } from 'vitest'
import {
  activityQuery,
  auditFirstPage,
  auditHref,
  factQuery,
  localDate,
  readAuditContext,
  recordedTime,
} from './audit-context'

it('keeps applied locators but discards the prior cursor and detail when starting another query', () => {
  const context = readAuditContext(
      new URLSearchParams(
        'view=activities&device=device-a&policy=11111111-1111-4111-8111-111111111111&from=1&until=20&cursor=YWJj&activity=native%3Afact',
      ),
    ),
    first = auditFirstPage(context)
  expect(first).toMatchObject({ device: 'device-a', from: 1, until: 20 })
  expect(first).not.toHaveProperty('cursor')
  expect(first).not.toHaveProperty('activity')
  expect(activityQuery(context)).not.toHaveProperty('device')
  expect(factQuery(context)).not.toHaveProperty('policy')
})
it('rejects invalid URL scope rather than silently issuing an unfiltered query', () => {
  for (const search of [
    'view=all',
    'from=not-a-number',
    'from=-1',
    'from=20&until=10',
    'limit=201',
    'operationId=not-an-operation',
  ])
    expect(() => readAuditContext(new URLSearchParams(search))).toThrow()
})
it('retains recording-time seconds when editing an unrelated filter', () => {
  expect(recordedTime(localDate(1700000001))).toBe(1700000001)
})

it('serializes only public locators and never treats a request ID as an operation ID', () => {
  const context = readAuditContext(
    new URLSearchParams(
      'view=activities&device=device-a&request=11111111-1111-4111-8111-111111111111&secret=private&payload=private',
    ),
  )
  expect(activityQuery(context)).toHaveProperty('request')
  expect(factQuery(context)).not.toHaveProperty('operationId')
  const href = auditHref(context)
  expect(href).not.toContain('private')
  expect(href).not.toContain('payload')
  expect(href).toContain('request=')
})
