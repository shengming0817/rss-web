import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import {
  connectionConfiguration,
  signedConnections,
  connectionState,
  connectionObservation,
  connectionReceipt,
  createConnectionsClient,
  connectionsFilename,
} from './connections'
import { configuration as enrollment } from '../../enrollment/clients/configurations'
const tenant = '11111111-1111-4111-8111-111111111111',
  service = '22222222-2222-4222-8222-222222222222',
  operation = '33333333-3333-4333-8333-333333333333'
const config = {
  wireVersion: 1,
  serviceId: service,
  tenantId: tenant,
  revision: 2,
  preferredOrigin: 'https://b.test:9443',
  origins: ['https://a.test', 'https://b.test:9443'],
  keyId: 'connections.v1',
}
const signed = { configuration: config, signature: 'A'.repeat(86) }
const state = {
  serviceId: service,
  draft: { configuration: config },
  published: signed,
  verificationKeys: { 'connections.v1': 'A'.repeat(43) },
  deployments: [
    {
      origin: 'https://b.test:9443',
      hostId: operation,
      revision: 3,
      observedAt: 100,
      configurationRevision: 2,
    },
  ],
  convergence: { targetRevision: 2, activeDevices: 3, confirmedDevices: 1 },
  retirementBlockers: { configurations: 1, installations: 2 },
}
it('requires a bounded canonical current wire with stable service/tenant and independent signature', () => {
  expect(signedConnections(signed, tenant, service).configuration).toEqual(config)
  for (const change of [
    { wireVersion: 0 },
    { serviceId: tenant },
    { tenantId: service },
    { revision: 0 },
    { origin: 'https://old.test' },
    { origins: [...config.origins].reverse() },
    { origins: [...config.origins, config.origins[0]] },
    { preferredOrigin: 'https://evil.test' },
    { preferredOrigin: 'https://b.test:9443/' },
    { origins: Array.from({ length: 9 }, (_, i) => `https://${i}.test`) },
    { keyId: '../key' },
  ])
    expect(() => connectionConfiguration({ ...config, ...change }, tenant, service)).toThrow()
  for (const value of [
    { ...signed, secret: 'no' },
    { ...signed, signature: 'B'.repeat(86) },
    { ...signed, signature: 'A'.repeat(85) },
  ])
    expect(() => signedConnections(value, tenant)).toThrow()
})
it('keeps desired, published, deployment and device facts distinct and rejects impossible projections', () => {
  expect(connectionState(state, tenant).convergence.confirmedDevices).toBe(1)
  expect(
    connectionState(
      { ...state, published: null, convergence: { ...state.convergence, targetRevision: null } },
      tenant,
    ).published,
  ).toBeNull()
  for (const value of [
    { ...state, extra: true },
    { ...state, serviceId: tenant },
    { ...state, convergence: { ...state.convergence, confirmedDevices: 4 } },
    { ...state, convergence: { ...state.convergence, targetRevision: 1 } },
    { ...state, verificationKeys: {} },
  ])
    expect(() => connectionState(value, tenant)).toThrow()
  expect(connectionObservation(null)).toBeNull()
  const observation = {
    targetRevision: 3,
    registration: operation,
    generation: 2,
    acknowledgement: {
      operationId: tenant,
      revision: 2,
      digest: 'a'.repeat(64),
      origin: config.preferredOrigin,
    },
    receivedAt: 100,
    failure: {
      report: { operationId: service, revision: 3, reason: 'persistence_failed' },
      origin: config.preferredOrigin,
      receivedAt: 101,
    },
  }
  expect(connectionObservation(observation)).toMatchObject({
    targetRevision: 3,
    acknowledgement: { revision: 2 },
    failure: { report: { revision: 3 } },
  })
  expect(() => connectionObservation({ ...observation, receivedAt: null })).toThrow()
  expect(() =>
    connectionObservation({
      ...observation,
      failure: {
        ...observation.failure,
        report: { ...observation.failure.report, reason: 'future' },
      },
    }),
  ).toThrow()
  expect(() => connectionState(state, tenant, operation)).toThrow()
  expect(connectionReceipt(null, tenant)).toBeNull()
  expect(() =>
    connectionReceipt(
      { action: 'published', configuration: signed, operationId: operation },
      tenant,
    ),
  ).toThrow()
})
it('binds write receipts and pagination, and downloads only the exact public signed attachment', async () => {
  let reply: unknown = { configuration: config }
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply)),
    client = createConnectionsClient({ request } as unknown as HttpTransport, tenant, service)
  await client.save(operation, 1, config.preferredOrigin, config.origins)
  expect(request.mock.lastCall![0]).toMatchObject({
    method: 'PUT',
    body: {
      operationId: operation,
      expectedRevision: 1,
      preferredOrigin: config.preferredOrigin,
      origins: config.origins,
    },
  })
  await expect(client.save(operation, 0, config.preferredOrigin, config.origins)).rejects.toThrow()
  reply = signed
  await client.publish(operation, 2)
  await expect(client.publish(operation, 1)).rejects.toThrow()
  reply = null
  expect(await client.operation(operation)).toBeNull()
  reply = {
    targetRevision: 2,
    items: [
      {
        device: 'device-id',
        registration: operation,
        generation: 1,
        installedRevision: 1,
        origin: 'https://a.test',
        receivedAt: 100,
      },
    ],
    next: service,
  }
  expect((await client.devices(2, tenant)).next).toBe(service)
  expect(request.mock.lastCall![0]).toMatchObject({ query: { revision: 2, after: tenant } })
  await expect(client.devices(3)).rejects.toThrow()
  const encoded = new TextEncoder().encode(JSON.stringify(signed)),
    bytes = new ArrayBuffer(encoded.byteLength)
  new Uint8Array(bytes).set(encoded)
  reply = {
    bytes,
    contentType: 'application/json',
    contentDisposition: `attachment; filename="${connectionsFilename}"`,
  }
  expect((await client.download()).bytes.byteLength).toBeGreaterThan(0)
  reply = { ...(reply as object), contentDisposition: 'attachment; filename="old.json"' }
  await expect(client.download()).rejects.toThrow()
})
it('embeds the signed locations in enrollment and rejects retired origin-only configuration', () => {
  const file = {
    wireVersion: 1,
    configurationId: operation,
    tenantId: tenant,
    connections: signed,
    targets: [{ platform: 'windows', architecture: 'aarch64' }],
    expiresAt: 100,
    quantity: { kind: 'finite', count: 1 },
    keyId: 'enrollment',
  }
  expect(enrollment(file, tenant).connections.configuration.serviceId).toBe(service)
  const old: Record<string, unknown> = { ...file }
  delete old['connections']
  expect(() => enrollment({ ...old, origin: 'https://a.test' }, tenant)).toThrow()
  expect(() =>
    enrollment(
      { ...file, connections: { ...signed, configuration: { ...config, tenantId: service } } },
      tenant,
    ),
  ).toThrow()
})
