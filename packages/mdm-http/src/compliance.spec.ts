import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createComplianceAdapter } from './compliance'

const id = '11111111-1111-4111-8111-111111111111',
  task = '22222222-2222-4222-8222-222222222222',
  other = '33333333-3333-4333-8333-333333333333'
function fixture(value: unknown) {
  const request = vi.fn(async (options: RequestOptions<unknown>) => options.decode(value))
  return { transport: { request } as unknown as HttpTransport, request }
}
function assessment() {
  return {
    ruleId: id,
    ruleVersion: 2,
    dictionaryVersion: 'dictionary',
    assetCut: {
      tenant: '11111111-1111-4111-8111-111111111111',
      epoch: '22222222-2222-4222-8222-222222222222',
      snapshot: '1:2:',
    },
    evaluatedAt: 100,
    groups: [],
    status: 'unknown',
    reason: 'facts_unknown',
    condition: 'unknown',
    applicability: { platform: 'all', platformDecision: 'match', sources: [], groups: [] },
    explanations: [{ context: 'device', path: [0], outcome: 'conflict' }],
    evidence: [],
  }
}
it('admits projected rule rows without requiring a full definition or flattening false', async () => {
  const f = fixture({
      items: [{ id, name: 'Projected', enabled: false, revision: 3 }],
      nextCursor: 'b3BhcXVl',
    }),
    client = createComplianceAdapter(f.transport)
  expect(
    (await client.list({ fields: ['id', 'name', 'enabled', 'revision'], limit: 1 })).items,
  ).toEqual([{ id, name: 'Projected', enabled: false, revision: 3 }])
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({ query: { fields: 'id,name,enabled,revision', limit: 1 } }),
  )
})
it('decodes flattened history entries while validating strict assessment facts separately', async () => {
  const value = { ...assessment(), task, disposition: 'superseded' },
    f = fixture({ items: [value], nextCursor: 'b3BhcXVl' }),
    client = createComplianceAdapter(f.transport)
  expect(
    await client.history('endpoint', { from: 0, until: 100, cursor: 'cHJldmlvdXM', limit: 1 }),
  ).toEqual({ items: [value], nextCursor: 'b3BhcXVl' })
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({
      path: '/api/v1/devices/{id}/compliance/history',
      pathParams: { id: 'endpoint' },
      query: { from: 0, until: 100, cursor: 'cHJldmlvdXM', limit: 1 },
    }),
  )
})
it('keeps pending current=null and a previous assessment without promoting historical evidence', async () => {
  const value = {
      device: 'endpoint',
      status: 'pending',
      reason: null,
      rules: [
        { ruleId: id, ruleVersion: 3, status: 'pending', current: null, previous: assessment() },
      ],
    },
    f = fixture(value)
  expect(await createComplianceAdapter(f.transport).current('endpoint')).toEqual(value)
  await expect(createComplianceAdapter(f.transport).current('other-endpoint')).rejects.toThrow()
})
it('allows all applicability observations while retaining the per-field two-source evidence budget', async () => {
  const sources = [id, task, other].map((registration, i) => ({
      source: ['mdm.windows', 'agent.builtin', 'agent.native'][i]!,
      deviceId: registration,
      epoch: task,
    })),
    value = { ...assessment(), applicability: { ...assessment().applicability, sources } },
    f = fixture({ items: [{ ...value, task, disposition: 'published' }], nextCursor: null })
  expect(
    (await createComplianceAdapter(f.transport).history('endpoint', {})).items[0]?.applicability
      .sources,
  ).toHaveLength(3)
})
it('binds a task to its requested rule without assuming task equals the original operation', async () => {
  const f = fixture({
      task,
      ruleId: id,
      ruleVersion: 2,
      assetCut: {
        tenant: '11111111-1111-4111-8111-111111111111',
        epoch: '22222222-2222-4222-8222-222222222222',
        snapshot: '1:2:',
      },
      phase: 'queued',
      processed: 0,
      completed: false,
      failure: null,
      diagnostic: null,
    }),
    client = createComplianceAdapter(f.transport)
  expect((await client.task(id, task)).processed).toBe(0)
  await expect(client.task(other, task)).rejects.toThrow('Wrong compliance task coordinates')
})
