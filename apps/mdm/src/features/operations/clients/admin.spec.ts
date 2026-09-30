import { expect, it } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createAdminClients } from './admin'
const id = '11111111-1111-4111-8111-111111111111'
it('rejects duplicate entity identity even when content and revision differ', async () => {
  const definition = {
    name: 'Desk',
    kind: 'itsm' as const,
    endpoint: 'https://desk.example.test',
    credentialRef: null,
    enabled: true,
  }
  const item = { id, revision: 1, operation: id, definition, health: 'unknown' }
  const transport = {
    request: async (o: RequestOptions<unknown>) =>
      o.decode({
        contract: 'operations-v1',
        tenantId: id,
        source: 'mock',
        snapshot: id,
        nextCursor: null,
        items: [item, { ...item, revision: 2, health: 'healthy' }],
      }),
  } as HttpTransport
  await expect(createAdminClients(transport, id, true).connectors.list()).rejects.toThrow(
    'Duplicate',
  )
})

it('binds management receipts to identity, CAS revision and connector parent', async () => {
  const op = { operationId: id, expectedRevision: 2, input: {} }
  const other = '22222222-2222-4222-8222-222222222222'
  const definition = {
    name: 'Desk',
    kind: 'itsm' as const,
    endpoint: 'https://desk.example.test',
    credentialRef: null,
    enabled: true,
  }
  let value: unknown = { id: other, revision: 3, operation: id, definition, health: 'unknown' }
  const transport = {
    request: async (o: RequestOptions<unknown>) =>
      o.decode({
        contract: 'operations-v1',
        tenantId: id,
        source: 'mock',
        [o.path.endsWith('/test') ? 'delivery' : o.path.endsWith('/reports') ? 'job' : 'connector']:
          value,
      }),
  } as HttpTransport
  const client = createAdminClients(transport, id, true)
  await expect(client.connectors.save(id, { ...op, input: definition })).rejects.toThrow('receipt')
  value = { id, revision: 2, operation: id, definition, health: 'unknown' }
  await expect(client.connectors.save(id, { ...op, input: definition })).rejects.toThrow('receipt')
  value = { id, revision: 3, operation: id, definition, health: 'unknown' }
  await expect(client.connectors.save(id, { ...op, input: definition })).resolves.toMatchObject({
    id,
    revision: 3,
  })
  value = {
    id,
    revision: 1,
    operation: id,
    connector: other,
    kind: 'test',
    state: 'queued',
    attempt: 1,
    previous: null,
    at: 100,
    reason: null,
  }
  await expect(client.connectors.test(id, op)).rejects.toThrow('receipt')
  value = {
    id: other,
    revision: 1,
    operation: id,
    phase: 'accepted',
    createdAt: 100,
    range: { from: 0, until: 100 },
    result: null,
  }
  await expect(
    client.reports.run({ ...op, expectedRevision: 0, input: { from: 0, until: 100 } }),
  ).rejects.toThrow('receipt')
})
