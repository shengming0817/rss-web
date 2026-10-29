import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createEnrollmentAdapter, createPublicEnrollmentAdapter } from './enrollment'
const tenant = '11111111-1111-4111-8111-111111111111',
  service = '22222222-2222-4222-8222-222222222222',
  operation = '33333333-3333-4333-8333-333333333333',
  configurationId = '44444444-4444-4444-8444-444444444444'
function fixture(value: unknown) {
  const request = vi.fn(async (options: RequestOptions<unknown>) => options.decode(value))
  return { transport: { request } as unknown as HttpTransport, request }
}
it('preserves the exact signed JSON bytes and binds the issued document to tenant and service', async () => {
  const payload = {
    configuration: {
      wireVersion: 1,
      configurationId,
      tenantId: tenant,
      connections: {
        configuration: {
          wireVersion: 1,
          serviceId: service,
          tenantId: tenant,
          revision: 2,
          preferredOrigin: 'https://agent.example',
          origins: ['https://agent.example'],
          keyId: 'connection-key',
        },
        signature: 'A'.repeat(86),
      },
      targets: [{ platform: 'windows' as const, architecture: 'x86_64' as const }],
      expiresAt: 1000,
      quantity: { kind: 'finite' as const, count: 2 },
      keyId: 'enrollment-key',
    },
    secret: 'A'.repeat(43),
    signature: 'A'.repeat(86),
  }
  const original = JSON.stringify(payload, null, 2) + '\n',
    bytes = new TextEncoder().encode(original).buffer,
    f = fixture({
      bytes,
      contentType: 'application/json',
      contentDisposition: 'attachment; filename="rss-agent-enrollment.json"',
    }),
    client = createEnrollmentAdapter(f.transport, f.transport, tenant, service)
  const issued = await client.issueConfiguration(
    {
      operationId: operation,
      lifetimeSeconds: 60,
      quantity: payload.configuration.quantity,
      targets: payload.configuration.targets,
    },
    payload.secret,
  )
  expect(issued.file.bytes).toBe(bytes)
  expect(new TextDecoder().decode(issued.file.bytes)).toBe(original)
  expect(issued.configuration.connectionRevision).toBe(2)
  expect(issued.configuration).not.toHaveProperty('secret')
  const wrong = new TextEncoder().encode(
      JSON.stringify({
        ...payload,
        configuration: { ...payload.configuration, tenantId: service },
      }),
    ).buffer,
    foreign = fixture({
      bytes: wrong,
      contentType: 'application/json',
      contentDisposition: 'attachment; filename=rss-agent-enrollment.json',
    })
  await expect(
    createEnrollmentAdapter(
      foreign.transport,
      foreign.transport,
      tenant,
      service,
    ).issueConfiguration(
      {
        operationId: operation,
        lifetimeSeconds: 60,
        quantity: payload.configuration.quantity,
        targets: payload.configuration.targets,
      },
      payload.secret,
    ),
  ).rejects.toThrow('Wrong configuration')
  expect(new Uint8Array(wrong).every((byte) => byte === 0)).toBe(true)
})
it('queries the original issuance operation without resubmitting or disclosing a secret', async () => {
  const f = fixture(null),
    client = createEnrollmentAdapter(f.transport, f.transport, tenant, service)
  expect(await client.configurationOperation(operation)).toBeNull()
  expect(f.request).toHaveBeenCalledTimes(1)
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'GET',
      path: '/api/v1/agent-configuration-operations/{id}',
      pathParams: { id: operation },
    }),
  )
})
it('leaves native profile-password failures on the public executor without entering a console session', async () => {
  const publicRequest = vi.fn(async () => {
      throw { status: 401, code: 'invalid_credentials' }
    }),
    authenticated = fixture(undefined),
    client = createEnrollmentAdapter(
      authenticated.transport,
      { request: publicRequest } as unknown as HttpTransport,
      tenant,
      service,
    )
  await expect(client.profile(configurationId, 'A'.repeat(43))).rejects.toMatchObject({
    status: 401,
  })
  expect(authenticated.request).not.toHaveBeenCalled()
  expect(publicRequest).toHaveBeenCalledTimes(1)
})
it('exposes public package content and callback routes without an agent web enrollment endpoint', async () => {
  const f = fixture([]),
    client = createPublicEnrollmentAdapter(f.transport, tenant)
  expect(await client.packages()).toEqual([])
  expect(client.packageUrl(configurationId)).toBe(
    `/api/v1/agent/enroll/packages/${configurationId}/content`,
  )
  expect(client.termsFinishUrl()).toBe('/api/v1/windows/entra/terms/finish')
  expect(client.appleBridgeUrl()).toBe('/api/v1/apple/account-enrollment/authenticate')
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({ method: 'GET', path: '/api/v1/agent/enroll/packages' }),
  )
})
