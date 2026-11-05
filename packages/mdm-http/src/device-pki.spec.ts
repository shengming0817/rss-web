import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createDevicePki } from '@rss/mdm-certificates/device-pki'
import { createDevicePkiAdapter } from './device-pki'
const tenant = '11111111-1111-4111-8111-111111111111',
  service = '22222222-2222-4222-8222-222222222222',
  operation = '33333333-3333-4333-8333-333333333333',
  issuance = '44444444-4444-4444-8444-444444444444'
function fixture(value: unknown) {
  const request = vi.fn(async (options: RequestOptions<unknown>) => options.decode(value)),
    transport = { request } as unknown as HttpTransport
  return {
    request,
    adapter: createDevicePkiAdapter(transport, tenant, service),
    core: createDevicePki(createDevicePkiAdapter(transport, tenant, service), tenant, service),
  }
}
const trust = () => ({
  version: 1,
  tenant,
  service_id: service,
  origin: 'https://mdm.example.test',
  purpose: 'agent',
  revision: 2,
  issuers: [
    {
      digest: 'a'.repeat(64),
      mode: 'active',
      certificate: 'YQ==',
      root: 'YQ==',
      crl: 'YQ==',
      root_crl: 'YQ==',
      provisioner: 'provider',
      kid: '',
    },
  ],
})
it('admits formal loaded trust and maps only the declared public material fields', async () => {
  const f = fixture(trust()),
    value = await f.core.trust('agent')
  expect(value).toMatchObject({
    serviceId: service,
    purpose: 'agent',
    revision: 2,
    issuers: [{ rootCrl: 'YQ==' }],
  })
  expect(value).not.toHaveProperty('desired')
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'GET',
      path: '/api/v1/pki/{purpose}/trust',
      pathParams: { purpose: 'agent' },
    }),
  )
  for (const value of [
    { ...trust(), tenant: service },
    { ...trust(), service_id: tenant },
    { ...trust(), purpose: 'agent_bootstrap' },
    { ...trust(), revision: 9007199254740992 },
  ])
    await expect(fixture(value).core.trust('agent')).rejects.toBeDefined()
})
it('submits exact PKI operations using the generated wire rather than the domain shape', async () => {
  const f = fixture({ operation, revision: 3, state: 'distributing' }),
    loaded = await fixture(trust()).core.trust('agent')
  await f.core.prepare({
    id: operation,
    purpose: 'agent',
    expectedRevision: 2,
    candidate: { ...loaded, revision: 3 },
  })
  const sent = f.request.mock.calls[0]![0]
  expect(sent.body).toMatchObject({
    id: operation,
    expected_revision: 2,
    candidate: { version: 1, service_id: service, revision: 3, issuers: [{ root_crl: 'YQ==' }] },
  })
  expect(sent.body).not.toHaveProperty('expectedRevision')
  const activated = fixture({ operation, revision: 4, state: 'activated' })
  await activated.core.transition({
    id: operation,
    purpose: 'agent',
    expectedRevision: 3,
    action: 'activate',
  })
  expect(activated.request).toHaveBeenCalledWith(
    expect.objectContaining({
      pathParams: { purpose: 'agent' },
      body: { id: operation, expected_revision: 3, action: 'activate' },
    }),
  )
})
it('treats CRL 204 as publication only and binds Windows recovery to the frozen attempt', async () => {
  const f = fixture(undefined)
  await f.core.publish({
    operation,
    purpose: 'windows',
    publications: [{ issuer: 'a'.repeat(64), crl: 'YQ==', rootCrl: 'YQ==' }],
  })
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({
      successStatus: 204,
      body: {
        operation,
        purpose: 'windows',
        publications: [{ issuer: 'a'.repeat(64), crl: 'YQ==', root_crl: 'YQ==' }],
      },
    }),
  )
  const recovery = fixture({ attempt: issuance, fingerprint: 'b'.repeat(64) })
  await recovery.core.recoverSigning({ operation, attempt: issuance, chain: ['YQ=='] })
  expect(recovery.request).toHaveBeenCalledWith(
    expect.objectContaining({
      path: '/api/v1/pki/signing/recover',
      body: { operation, attempt: issuance, chain: ['YQ=='] },
    }),
  )
})
it('retains installation observations separately from ACK and rejects unpaired material coordinates', async () => {
  const value = {
    observation: {
      version: 1,
      operation,
      registration: issuance,
      generation: 2,
      sequence: 9,
      target_revision: 2,
      target_digest: 'a'.repeat(64),
      actual_revision: 1,
      actual_digest: 'b'.repeat(64),
      state: 'failed',
      reason: 'storage',
      observed_at: 100,
    },
    received_at: 101,
  }
  const result = await fixture(value).core.observation('device-a')
  expect(result).toMatchObject({
    target: { revision: 2 },
    actual: { revision: 1 },
    state: 'failed',
    reason: 'storage',
  })
  expect(result).not.toHaveProperty('acknowledged')
  await expect(
    fixture({
      ...value,
      observation: { ...value.observation, target_digest: null },
    }).core.observation('device-a'),
  ).rejects.toBeDefined()
  expect(await fixture(null).core.observation('device-a')).toBeNull()
})
it('uses all three original Agent recovery routes with distinct administrator and original signing operations', async () => {
  const receipt = {
      wireVersion: 1,
      grantId: issuance,
      state: 'available',
      expiresAt: 1800000000,
      platform: 'windows',
    },
    f = fixture(receipt)
  await f.core.recoverRegistration(
    { registration: issuance, operationId: operation, platform: 'windows', csr: 'YQ==' },
    'A'.repeat(43),
  )
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({
      path: '/api/v1/agent-registrations/{id}/recovery',
      pathParams: { id: issuance },
      body: {
        wireVersion: 1,
        operationId: operation,
        secret: 'A'.repeat(43),
        platform: 'windows',
        csr: 'YQ==',
      },
    }),
  )
  const candidate = {
      wireVersion: 1,
      issuanceId: issuance,
      operationId: tenant,
      certificateChain: ['YQ=='],
      activateBefore: 1800000000,
    },
    recovery = fixture(candidate)
  expect(
    (
      await recovery.core.recoverIssuance({
        issuance,
        operationId: operation,
        certificateChain: ['YQ=='],
      })
    ).originalSigningOperationId,
  ).toBe(tenant)
  recovery.request.mockImplementation(async (options: RequestOptions<unknown>) =>
    options.decode(
      options.path === '/api/v1/agent-issuances/{id}/recovery-operations'
        ? {
            items: [
              { actor: 'original-admin', instance: 'original-instance', operationId: operation },
            ],
            nextCursor: null,
          }
        : candidate,
    ),
  )
  expect(
    (await recovery.core.issuanceRecovery(issuance, operation))!.originalSigningOperationId,
  ).toBe(tenant)
  expect(recovery.request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      method: 'GET',
      pathParams: { id: issuance, operation },
      query: { actor: 'original-admin', instance: 'original-instance' },
    }),
  )
})
