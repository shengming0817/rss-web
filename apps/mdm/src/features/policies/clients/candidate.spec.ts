import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createConfigurationsClient } from './configurations'
import { createExecutionsClient } from './executions'
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
