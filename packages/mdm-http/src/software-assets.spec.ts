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
