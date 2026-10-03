import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createCertificateArchiveClient } from './client'
const id = '11111111-1111-4111-8111-111111111111'
it('uses the shared executor and explicit operation header; rejects the wrong receipt', async () => {
  const requests: RequestOptions<unknown>[] = []
  const request = vi.fn(async (options: RequestOptions<unknown>) => {
    requests.push(options)
    return options.decode({
      operationId: id,
      action: 'certificate_archive_initialize',
      entryId: null,
      version: null,
      revision: 1,
    })
  })
  const client = createCertificateArchiveClient({ request } as unknown as HttpTransport, id)
  await client.initialize(id, 'transient password')
  expect(requests[0]!.path).toBe('/api/v1/certificate-archive/vault/initialize')
  expect(requests[0]!.headers).toEqual({ 'Idempotency-Key': id })
  await expect(
    client.initialize('22222222-2222-4222-8222-222222222222', 'transient password'),
  ).rejects.toThrow()
  expect(request).toHaveBeenCalledTimes(2)
})
