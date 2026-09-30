import { expect, it } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createAdminClients } from './admin'
const id = '11111111-1111-4111-8111-111111111111'
it('rejects duplicate entity identity even when content and revision differ', async () => {
  const definition = {
    name: 'Desk',
    kind: 'itsm',
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
