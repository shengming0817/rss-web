import { describe, expect, it } from 'vitest'
import { createFlows } from './flow'
import { TENANT } from '../../tests/support'
describe('bounded per-tab continuation', () => {
  it('consumes before resumption and rejects expiry, rollback and corruption', () => {
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
    const value = { kind: 'sso' as const, tenant: TENANT }
    f.save(value)
    expect(f.take()?.tenant).toBe(TENANT)
    expect(f.take()).toBeNull()
    f.save(value)
    now += 300000
    expect(f.read()).toBeNull()
    f.save(value)
    now--
    expect(f.read()).toBeNull()
    f.save({ ...value, kind: 'link' })
    expect(f.read()?.kind).toBe('link')
    const key = [...map.keys()][0]!
    map.set(key, 'private-invalid-json')
    expect(f.read()).toBeNull()
    expect(() => f.save({ ...value, tenant: 'bad' })).toThrow()
  })
})
