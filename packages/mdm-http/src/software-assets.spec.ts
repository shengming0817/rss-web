import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createSoftwareAssets } from '@rss/mdm-inventory'
import { createSoftwareAssetsAdapter } from './software-assets'

const tenant = '00000000-0000-4000-8000-000000000001'
const task = '00000000-0000-4000-8000-000000000002'
const statusUrl = '/api/v1/software-asset-queries/' + task

it('opens a software query from the formally accepted HTTP envelope', async () => {
  const request = vi.fn(async (options: RequestOptions<unknown>) =>
    options.decode({ tenantId: tenant, asset: { kind: 'accepted', task, statusUrl } }),
  )
  const assets = createSoftwareAssets(
    createSoftwareAssetsAdapter({ request } as unknown as HttpTransport, tenant),
  )
  await expect(
    assets.mutate({
      kind: 'query',
      operation: {
        operationId: task,
        expectedRevision: 0,
        input: {
          context: 'endpoint',
          devices: { filter: null, scope: { selector: { kind: 'device' }, quantifier: 'one' } },
          groups: null,
          software: { standards: [], risks: [], tags: [], filter: null },
          dimensions: ['version'],
        },
      },
    }),
  ).resolves.toEqual({ kind: 'accepted', task, statusUrl })
  expect(request.mock.calls[0]?.[0]).toMatchObject({
    path: '/api/v1/software-asset-queries',
    method: 'POST',
  })
})

const coordinates = {
  asOf: 1,
  assetCut: { tenant, epoch: task, snapshot: '1:2:' },
  associationRevision: 0,
  configurationRevision: 0,
  context: 'endpoint',
  groups: [],
  objectSnapshot: null,
  objectVersion: null,
}
function evidenceFixture(value: unknown) {
  const reply = {
      tenantId: tenant,
      asset: {
        kind: 'software',
        response: {
          kind: 'evidence',
          task,
          coordinates,
          nextCursor: null,
          quality: [],
          items: [
            {
              endpoint: 'pc',
              source: 'device.software.installations',
              evidence: {
                scope: { kind: 'device' },
                source: 'agent.native',
                dataset: null,
                deviceId: 'pc',
                epoch: task,
                snapshotId: task,
                observedAt: 1,
                receivedAt: 2,
                actor: null,
              },
              arrayVersion: 'v1',
              ordinal: 0,
              value,
              rules: [],
              confirmed: true,
            },
          ],
        },
      },
    },
    request = vi.fn(async (options: RequestOptions<unknown>) => options.decode(reply))
  return createSoftwareAssetsAdapter({ request } as unknown as HttpTransport, tenant)
}
it('retains both signed i64 extremes and nested integer evidence exactly', async () => {
  const value = {
    kind: 'object',
    value: {
      minimum: { kind: 'integer', value: '-9223372036854775808' },
      nested: {
        kind: 'array',
        value: [
          { kind: 'integer', value: '9223372036854775807' },
          { kind: 'integer', value: '0' },
        ],
      },
    },
  }
  expect(
    (await evidenceFixture(value).evidence(task, task, { kind: 'endpoint', id: 'pc' }, {})).items[0]
      ?.value,
  ).toEqual(value)
})
it.each([9007199254740992, '01', '-0', '+1', '9223372036854775808', '-9223372036854775809'])(
  'rejects malformed or out-of-range integer evidence %s',
  async (value) => {
    await expect(
      evidenceFixture({ kind: 'integer', value }).evidence(
        task,
        task,
        { kind: 'endpoint', id: 'pc' },
        {},
      ),
    ).rejects.toThrow()
  },
)
it('reopens a task using its required frozen dimensions', async () => {
  const reply = {
      tenantId: tenant,
      asset: {
        kind: 'software',
        response: {
          kind: 'status',
          task,
          coordinates,
          status: 'completed',
          resultState: 'retained',
          dimensions: ['version'],
          failure: null,
          processed: 0,
          unknown: 0,
        },
      },
    },
    request = vi.fn(async (options: RequestOptions<unknown>) => options.decode(reply)),
    adapter = createSoftwareAssetsAdapter({ request } as unknown as HttpTransport, tenant)
  expect((await adapter.status(task)).dimensions).toEqual(['version'])
})
