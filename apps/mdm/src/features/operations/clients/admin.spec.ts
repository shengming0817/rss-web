import { expect, it } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createAdminClients } from './admin'
const id = '11111111-1111-4111-8111-111111111111'
it('rejects reports not bound to the accepted operation', async () => {
  const transport = {
    request: async (o: RequestOptions<unknown>) =>
      o.decode({
        contract: 'operations-v1',
        tenantId: id,
        source: 'mock',
        job: {
          id: '22222222-2222-4222-8222-222222222222',
          revision: 1,
          operation: id,
          phase: 'accepted',
          createdAt: 100,
          range: { from: 0, until: 100 },
          result: null,
        },
      }),
  } as HttpTransport
  await expect(
    createAdminClients(transport, id, true).reports.run({
      operationId: id,
      expectedRevision: 0,
      input: { from: 0, until: 100 },
    }),
  ).rejects.toThrow('receipt')
})
