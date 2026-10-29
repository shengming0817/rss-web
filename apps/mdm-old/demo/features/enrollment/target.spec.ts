import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createEnrollmentDemo } from '../../devices/enrollment'
import type { DemoDevice } from '../../devices/fixtures'
import { TENANT, MANAGEMENT_TENANT } from '../../scenario'
import { createDemoEnrollmentTargetResolver } from './target'

it('keeps explicit Mock target evidence separate from formal status and fences its original owner and tenant', async () => {
  const devices = new Map<string, DemoDevice>(),
    domain = createEnrollmentDemo(() => devices),
    actor = { principalId: randomUUID(), sessionId: randomUUID(), tenantId: TENANT }
  const invoke = (method: string, path: string, body?: unknown, who = actor) =>
    domain.handle(
      {
        method,
        path,
        body,
        actor: who,
        query: new URLSearchParams(),
        headers: { 'idempotency-key': randomUUID() },
      },
      'normal',
    )!
  const created = invoke('POST', '/api/v1/self-enrollments', {
    source: 'mdm.windows',
    windowsProfile: 'Full',
    password: Buffer.alloc(32, 1).toString('base64url'),
  })
  expect(created.status).toBe(200)
  const receipt = created.body as { enrollmentId: string; deviceId: string }
  expect(invoke('GET', `/api/v1/enrollments/${receipt.enrollmentId}`).body).not.toHaveProperty(
    'deviceId',
  )
  const transport = {
    async request<T>(options: RequestOptions<T>) {
      const path = options.path.replace('{id}', String(options.pathParams?.['id']))
      const response = invoke(options.method, path)
      expect(response.status).toBe(options.successStatus)
      return options.decode(response.body)
    },
  } as HttpTransport
  expect(await createDemoEnrollmentTargetResolver(transport)(receipt.enrollmentId)).toEqual({
    enrollmentId: receipt.enrollmentId,
    deviceId: receipt.deviceId,
  })
  const path = `/api/v1/mdm-candidate/devices/self-enrollments/${receipt.enrollmentId}/target`
  for (const who of [
    { ...actor, principalId: randomUUID() },
    { ...actor, tenantId: MANAGEMENT_TENANT },
  ])
    expect(invoke('GET', path, undefined, who).status).toBe(403)
  expect(invoke('POST', path).status).toBe(400)
})
