import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createScopesAdapter } from './scopes'

const id = '11111111-1111-4111-8111-111111111111',
  result = '22222222-2222-4222-8222-222222222222'
function fixture(value: unknown) {
  const request = vi.fn(async (options: RequestOptions<unknown>) => options.decode(value))
  return { client: createScopesAdapter({ request } as unknown as HttpTransport), request }
}
it('does not convert a not-yet-computed scope into an empty membership result', async () => {
  const value = {
    id,
    revision: 1,
    definition: { targets: [], limitations: null, exclusions: [] },
    resolution: null,
    resolutionRevision: 0,
  }
  expect(await fixture(value).client.read(id)).toEqual(value)
  await expect(fixture(value).client.read(result)).rejects.toThrow()
})
it('keeps a server cursor and explicit zero calculation coordinates', async () => {
  const f = fixture({
    items: [{ id, calculationRevision: 0, resolutionRevision: 0, resolution: null }],
    nextCursor: 'b3BhcXVl',
  })
  const value = await f.client.list({
    fields: ['id', 'calculationRevision', 'resolutionRevision', 'resolution'],
    cursor: 'previous',
    limit: 1,
  })
  expect(value.items[0]).toEqual({
    id,
    calculationRevision: 0,
    resolutionRevision: 0,
    resolution: null,
  })
  expect(value.nextCursor).toBe('b3BhcXVl')
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({ query: expect.objectContaining({ cursor: 'previous', limit: 1 }) }),
  )
})
it('retains pending unknown exclusion facts and distinguishes absent from empty source evidence', async () => {
  const value = {
    scope: id,
    result,
    current: false,
    channel: 'agent',
    page: {
      kind: 'decisions',
      items: [
        {
          object: { kind: 'endpoint', id: 'endpoint-1' },
          available: false,
          qualification: { state: 'pending' },
          reasons: ['unknown_exclusion'],
          targets: [{ reference: { kind: 'group', id: result }, version: 3 }],
          limitations: [],
          exclusions: null,
        },
      ],
    },
    nextCursor: null,
  }
  const f = fixture(value)
  expect(await f.client.result(id, result, 'decisions', 'agent', {})).toEqual(value)
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({ query: expect.objectContaining({ channel: 'agent' }) }),
  )
  await expect(f.client.result(id, result, 'decisions', 'mdm', {})).rejects.toThrow('coordinates')
  await expect(f.client.result(id, result, 'members', 'agent', {})).rejects.toThrow('coordinates')
})
it('rejects unrepresentable membership entry coordinates', async () => {
  const f = fixture({
    scope: id,
    result,
    current: true,
    channel: 'mdm',
    page: {
      kind: 'decisions',
      items: [
        {
          object: { kind: 'endpoint', id: 'endpoint-1' },
          available: false,
          qualification: { state: 'eligible', entry: Number.MAX_SAFE_INTEGER + 1 },
          reasons: [],
          targets: [],
          limitations: [],
          exclusions: [],
        },
      ],
    },
    nextCursor: null,
  })
  await expect(f.client.result(id, result, 'decisions', 'mdm', {})).rejects.toThrow()
})

it('preserves unavailable historical members instead of removing them or changing their identity', async () => {
  const value = {
    scope: id,
    result,
    current: true,
    channel: 'mdm',
    page: {
      kind: 'members',
      items: [{ object: { kind: 'endpoint', id: 'endpoint-1' }, available: false }],
    },
    nextCursor: null,
  }
  expect(await fixture(value).client.result(id, result, 'members', 'mdm', {})).toEqual(value)
})
it('sends the complete draft and editing CAS for read-only bounded preview', async () => {
  const value = {
      items: [],
      channel: 'agent',
      scanComplete: false,
      stopReason: 'work_budget',
      hasUnknown: true,
      inputFingerprint: 'fixed',
      assetCut: { tenant: id, epoch: result, snapshot: '1:2:' },
      sources: [],
      asOf: 0,
    },
    f = fixture(value),
    request = {
      definition: { targets: [], limitations: [], exclusions: [] },
      channel: 'agent' as const,
      editing: { scopeId: id, expectedRevision: 3 },
    }
  expect(await f.client.preview(request)).toEqual(value)
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({ method: 'POST', path: '/api/v1/scopes/previews', body: request }),
  )
})
it('reads retained archived Policy references without requiring its full definition', async () => {
  const value = {
      items: [
        {
          kind: 'policy',
          id: result,
          version: id,
          revision: 3,
          roles: ['policy_scope', 'rollout_stage'],
          release: 'retained_archived_policy',
        },
      ],
      nextCursor: 'next',
    },
    f = fixture(value)
  expect(await f.client.references(id, { limit: 1 })).toEqual(value)
})
