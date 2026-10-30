import { describe, expect, it, vi } from 'vitest'
import { createScopes, validateDefinition } from './index'
import type { Operation } from '@rss/mdm-inventory'
import type { ScopeChange, ScopeDefinition, ScopesPort } from './model'

const id = '11111111-1111-4111-8111-111111111111'
const result = '22222222-2222-4222-8222-222222222222'
const operationId = '33333333-3333-4333-8333-333333333333'
const definition: ScopeDefinition = {
  targets: [{ kind: 'device', id: 'endpoint-1' }],
  limitations: null,
  exclusions: [],
}
describe('Scope authoring and result coordinates', () => {
  it('preserves unrestricted and explicitly empty limitations in frozen writes', async () => {
    const change = vi.fn(async (_id: string, input: Operation<ScopeChange>) => {
      if (input.input.action !== 'put') throw new Error('Expected put')
      expect(Object.isFrozen(input.input.definition.targets)).toBe(true)
      return { id, revision: 2, task: result }
    })
    const scopes = createScopes({ change } as unknown as ScopesPort)
    await scopes.change(id, {
      operationId,
      expectedRevision: 1,
      input: { action: 'put', definition },
    })
    await scopes.change(id, {
      operationId,
      expectedRevision: 1,
      input: { action: 'put', definition: { ...definition, limitations: [] } },
    })
    const first = change.mock.calls[0]?.[1].input
    const second = change.mock.calls[1]?.[1].input
    expect(first?.action === 'put' && first.definition.limitations).toBeNull()
    expect(second?.action === 'put' && second.definition.limitations).toEqual([])
  })
  it('rejects duplicate and excessive references without computing membership', () => {
    expect(() =>
      validateDefinition({
        ...definition,
        targets: [...definition.targets, ...definition.targets],
      }),
    ).toThrow('Duplicate')
    expect(() =>
      validateDefinition({
        ...definition,
        targets: Array.from({ length: 1001 }, (_, i) => ({ kind: 'device', id: `endpoint-${i}` })),
      }),
    ).toThrow('budget')
    expect(() =>
      validateDefinition({ ...definition, exclusions: [{ kind: 'group', id: 'endpoint-1' }] }),
    ).toThrow()
  })
  it('rejects a result from another channel even with matching scope/result IDs', async () => {
    const scopes = createScopes({
      result: async () => ({
        scope: id,
        result,
        channel: 'mdm',
        current: true,
        page: { kind: 'members', items: [] },
        nextCursor: null,
      }),
    } as unknown as ScopesPort)
    await expect(scopes.result(id, result, 'members', 'agent')).rejects.toThrow('coordinates')
  })
  it('rejects a receipt for a different CAS generation', async () => {
    const scopes = createScopes({
      change: async () => ({ id, revision: 8, task: result }),
    } as unknown as ScopesPort)
    await expect(
      scopes.change(id, { operationId, expectedRevision: 1, input: { action: 'put', definition } }),
    ).rejects.toThrow('receipt')
  })
})
