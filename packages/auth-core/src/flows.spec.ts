import { expect, it } from 'vitest'
import { createFlows } from './flows'
it('stores only a tenant/kind locator, expires at five minutes and consumes it once', () => {
  const entries = new Map<string, string>()
  let now = 1000
  const flow = createFlows(
    {
      getItem: (key) => entries.get(key) ?? null,
      setItem: (key, value) => {
        entries.set(key, value)
      },
      removeItem: (key) => {
        entries.delete(key)
      },
    },
    () => now,
  )
  flow.save('sso', '11111111-1111-4111-8111-111111111111')
  expect(Object.keys(JSON.parse([...entries.values()][0]!))).toEqual(['kind', 'tenant', 'created'])
  expect(flow.take()?.kind).toBe('sso')
  expect(flow.take()).toBeNull()
  flow.save('step-up', '11111111-1111-4111-8111-111111111111')
  now += 300_000
  expect(flow.read()).toBeNull()
  expect(entries.size).toBe(0)
})
