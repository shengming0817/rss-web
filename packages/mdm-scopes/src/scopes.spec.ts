import { describe, expect, it, vi } from 'vitest'
import { createScopes, validateDefinition } from './index'
import type { ScopeDefinition, ScopeOwner, ScopePreviewRequest, ScopesPort } from './model'
const id = '11111111-1111-4111-8111-111111111111',
  result = '22222222-2222-4222-8222-222222222222',
  operationId = '33333333-3333-4333-8333-333333333333',
  owner = { policyId: id }
const definition: ScopeDefinition = {
  targets: [{ kind: 'device', id: 'endpoint-1' }],
  limitations: null,
  exclusions: [],
}
describe('Policy-owned scope', () => {
  it('preserves unrestricted and explicitly empty limitations in frozen draft previews', async () => {
    const value = {
        items: [],
        channel: 'agent',
        scanComplete: true,
        stopReason: 'complete',
        hasUnknown: false,
        inputFingerprint: 'fixed',
        assetCut: { tenant: id, epoch: result, snapshot: '1:2:' },
        sources: [],
        asOf: 0,
      },
      preview = vi.fn(async (_owner: ScopeOwner, request: ScopePreviewRequest) => {
        expect(Object.isFrozen(request.definition.targets)).toBe(true)
        return value
      }),
      scopes = createScopes({ preview } as unknown as ScopesPort)
    await scopes.preview(owner, { expectedRevision: 0, definition, channel: 'agent' })
    await scopes.preview(owner, {
      expectedRevision: 0,
      definition: { ...definition, limitations: [] },
      channel: 'agent',
    })
    expect(preview.mock.calls[0]?.[1].definition.limitations).toBeNull()
    expect(preview.mock.calls[1]?.[1].definition.limitations).toEqual([])
  })
  it('rejects duplicate references and source budget overflow', () => {
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
  it('keeps Policy CAS distinct from computation revision and preserves an original retry', async () => {
    const recompute = vi.fn(async () => ({ id: result, revision: 17, task: operationId })),
      scopes = createScopes({ recompute } as unknown as ScopesPort),
      request = { operationId, expectedRevision: 7 }
    expect((await scopes.recompute(owner, request)).revision).toBe(17)
    await scopes.recompute(owner, request)
    expect(recompute.mock.calls[0]).toEqual(recompute.mock.calls[1])
    await expect(scopes.recompute(owner, { ...request, expectedRevision: 0 })).rejects.toThrow()
  })
  it('rejects another owner or result channel', async () => {
    const scopes = createScopes({
      read: async () => ({ stage: result }),
      result: async () => ({
        scope: id,
        result,
        channel: 'mdm',
        page: { kind: 'members', items: [] },
      }),
    } as unknown as ScopesPort)
    await expect(scopes.read(owner)).rejects.toThrow('owner')
    await expect(scopes.result(owner, id, result, 'members', 'agent')).rejects.toThrow(
      'coordinates',
    )
  })
})
