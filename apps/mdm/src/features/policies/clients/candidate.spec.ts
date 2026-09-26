import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createCatalogClient } from './catalog'
import { createConfigurationsClient } from './configurations'
import { createExecutionsClient } from './executions'
import { createWorkflowsClient, type WorkflowDefinition } from './workflows'
const tenant = '11111111-1111-4111-8111-111111111111'
const id = '22222222-2222-4222-8222-222222222222'
const snapshot = '33333333-3333-4333-8333-333333333333'
const envelope = (value: object) => ({
  contract: 'policies-v1',
  tenantId: tenant,
  source: 'mock',
  ...value,
})
function transport(initial: unknown) {
  let value = initial
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(value))
  return {
    http: { request } as unknown as HttpTransport,
    request,
    reply: (next: unknown) => {
      value = next
    },
  }
}
it('binds candidate list envelopes to tenant and source and carries snapshot cursors', async () => {
  const response = envelope({
    snapshot,
    items: [{ id, label: 'Pilot scope', revision: 1, status: 'ready' }],
    nextCursor: 'opaque',
  })
  const t = transport(response)
  const client = createCatalogClient(t.http, tenant, true)
  expect((await client.list('scopes')).nextCursor).toBe('opaque')
  await client.list('scopes', 'opaque')
  expect(t.request.mock.calls[1]![0]).toMatchObject({
    path: '/api/mdm-candidate/v1/policies/scopes',
    query: { cursor: 'opaque' },
  })
  await expect(createCatalogClient(t.http, tenant, false).list('scopes')).rejects.toThrow()
  t.reply({ ...response, tenantId: id })
  await expect(client.list('scopes')).rejects.toThrow()
})
it('reads published configuration versions and server preflight facts without authoring execution channels', async () => {
  const configuration = {
    id,
    revision: 2,
    name: 'Mac restrictions',
    platform: 'macos',
    format: 'apple_ddm',
    versions: [
      { version: 1, status: 'published', settings: [{ key: 'AllowCamera', value: false }] },
    ],
  }
  const t = transport(envelope({ configuration }))
  const client = createConfigurationsClient(t.http, tenant, true)
  expect(await client.read(id)).toEqual(configuration)
  t.reply(
    envelope({
      preview: {
        id: snapshot,
        configuration: id,
        version: 1,
        scope: tenant,
        scopeRevision: 3,
        status: 'completed',
        rows: [
          {
            device: 'device-01',
            support: 'unsupported',
            reason: 'platform',
            drift: 'unknown',
            conflicts: [],
          },
        ],
      },
    }),
  )
  expect((await client.previewStatus(id, snapshot)).rows[0]?.support).toBe('unsupported')
  t.reply(
    envelope({
      configuration: {
        ...configuration,
        versions: [{ ...configuration.versions[0], status: 'executed' }],
      },
    }),
  )
  await expect(client.read(id)).rejects.toThrow()
})
it('keeps accepted/published/received/effect/compliance as independent execution facts', async () => {
  const execution = {
    id,
    batch: snapshot,
    device: 'device-01',
    origin: { kind: 'native', operation: id },
    admission: 'accepted',
    dispatch: 'published',
    receipt: 'received',
    execution: 'succeeded',
    effect: 'unverified',
    compliance: 'unknown',
    attempt: null,
    nativeCode: 200,
    waitingReason: 'effect_verification',
  }
  const t = transport(envelope({ execution }))
  const client = createExecutionsClient(t.http, tenant, true)
  expect(await client.read(id)).toEqual(execution)
  t.reply(envelope({ execution: { ...execution, compliance: 'compliant' } }))
  await expect(client.read(id)).rejects.toThrow()
  t.reply(envelope({ execution: { ...execution, id: snapshot } }))
  await expect(client.read(id)).rejects.toThrow()
})
it('submits workflow CAS without accepting an approver supplied by a browser', async () => {
  const definition: WorkflowDefinition = {
    name: 'Collect and review',
    scope: tenant,
    schedule: {
      trigger: { kind: 'manual' },
      misfire: 'skip',
      notBefore: 0,
      until: 4102444800,
      jitterSeconds: 0,
      window: null,
    },
    steps: [
      {
        id: snapshot,
        name: 'Review',
        action: { kind: 'approval' },
        condition: null,
        onFailure: 'stop',
      },
    ],
  }
  const workflow = { id, revision: 1, version: 1, status: 'active', definition }
  const t = transport(envelope({ workflow }))
  const client = createWorkflowsClient(t.http, tenant, true)
  const body = {
    operationId: snapshot,
    expectedRevision: 0,
    input: { action: 'put' as const, definition },
  }
  expect(await client.change(id, body)).toEqual(workflow)
  expect(t.request.mock.calls[0]![0]).toMatchObject({
    method: 'POST',
    path: '/api/mdm-candidate/v1/policies/workflows/{id}',
    body,
  })
  t.reply(envelope({ workflow: { ...workflow, approver: 'browser-selected' } }))
  await expect(client.read(id)).rejects.toThrow()
})
