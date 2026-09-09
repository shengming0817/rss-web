import { describe, expect, it } from 'vitest'
import { createFlows } from './flow'
import { TENANT, ID } from '../../tests/support'
describe('bounded per-tab continuation', () => {
  it('consumes before acceptance and rejects expiry, rollback and corruption', () => {
    let now = 1000
    const map = new Map<string, string>()
    const store = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v)
      },
      removeItem: (k: string) => {
        map.delete(k)
      },
    }
    const f = createFlows(store, () => now)
    expect(f.read()).toBeNull()
    const value = {
      kind: 'login' as const,
      tenant: TENANT,
      challenge: 'one-use',
      flow: { tenant_id: TENANT, grant_id: ID },
    }
    f.save(value)
    expect(f.take()?.challenge).toBe('one-use')
    expect(f.take()).toBeNull()
    f.save(value)
    now += 300000
    expect(f.read()).toBeNull()
    f.save(value)
    now--
    expect(f.read()).toBeNull()
    f.save({ ...value, kind: 'sso', flow: null })
    expect(f.read()?.flow).toBeNull()
    const key = [...map.keys()][0]!
    map.set(key, 'private-invalid-json')
    expect(f.read()).toBeNull()
    expect(() => f.save({ ...value, tenant: 'bad' })).toThrow()
  })
})
