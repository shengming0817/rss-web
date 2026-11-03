import { describe, expect, it, vi } from 'vitest'
import { createScopes, validateDefinition } from './index'
import type { Operation } from '@rss/mdm-inventory'
import type { ScopeChange, ScopeDefinition, ScopePreviewRequest, ScopesPort } from './model'

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
it('recomputes with unchanged definition revision and keeps the original request on explicit retry', async () => {
  const change = vi.fn(async () => ({ id, revision: 7, task: result })),
    scopes = createScopes({ change } as unknown as ScopesPort),
    request = { operationId, expectedRevision: 7, input: { action: 'recompute' as const } }
  expect((await scopes.change(id, request)).revision).toBe(7)
  await scopes.change(id, request)
  expect(change.mock.calls).toHaveLength(2)
  expect(change.mock.calls[0]).toEqual(change.mock.calls[1])
  await expect(scopes.change(id, { ...request, expectedRevision: 0 })).rejects.toThrow()
})
it('keeps unknown or bounded draft samples distinct from an empty published scope', async () => {
  const value = {
      items: [],
      channel: 'mdm',
      scanComplete: false,
      stopReason: 'work_budget',
      hasUnknown: true,
      inputFingerprint: 'fixed',
      assetCut: { tenant: id, epoch: result, snapshot: '1:2:' },
      sources: [],
      asOf: 0,
    },
    preview = vi.fn(async (_request: ScopePreviewRequest) => value),
    scopes = createScopes({ preview } as unknown as ScopesPort)
  expect(
    await scopes.preview({ definition: { ...definition, limitations: [] }, channel: 'mdm' }),
  ).toEqual(value)
  expect(preview.mock.calls[0]?.[0]).toMatchObject({ definition: { limitations: [] } })
  await expect(scopes.preview({ definition, channel: 'agent' })).rejects.toThrow('preview')
})
