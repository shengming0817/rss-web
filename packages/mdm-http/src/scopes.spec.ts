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
    stage: null,
    retired: false,
    task: null,
    definition: { targets: [], limitations: null, exclusions: [] },
    resolution: null,
    resolutionRevision: 0,
  }
  expect(await fixture(value).client.read({ policyId: id })).toEqual(value)
  expect(await fixture(value).client.read({ policyId: result })).toEqual(value)
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
  expect(await f.client.result({ policyId: id }, id, result, 'decisions', 'agent', {})).toEqual(
    value,
  )
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({ query: expect.objectContaining({ channel: 'agent' }) }),
  )
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
  await expect(
    f.client.result({ policyId: id }, id, result, 'decisions', 'mdm', {}),
  ).rejects.toThrow()
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
  expect(
    await fixture(value).client.result({ policyId: id }, id, result, 'members', 'mdm', {}),
  ).toEqual(value)
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
      expectedRevision: 3,
    }
  expect(await f.client.preview({ policyId: id }, request)).toEqual(value)
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'POST',
      path: '/api/v1/policies/{policy}/scope/previews',
      pathParams: { policy: id },
      body: request,
    }),
  )
})
