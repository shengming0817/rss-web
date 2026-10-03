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
it.each([null, { entryId: id, version: 1 }])(
  'decodes list and history with the backend nullable requestVersion: %j',
  async (requestVersion) => {
    // rss-mdm certificate-archive-service/model.rs: Version and VersionRef serialize camelCase.
    const wire = {
      entryId: id,
      version: 2,
      actor: id,
      instance: id,
      operationId: id,
      createdAt: 100,
      metadata: {
        name: 'Issued certificate',
        category: 'custom',
        labels: [],
        usages: [],
        owner: '',
        notes: '',
      },
      facts: [],
      requestVersion,
      source: 'import',
    }
    let sample: unknown
    const request = vi.fn(async (options: RequestOptions<unknown>) => options.decode(sample))
    const client = createCertificateArchiveClient({ request } as unknown as HttpTransport, id)
    sample = {
      tenantId: id,
      items: [{ id, revision: 2, retired: false, recommendedVersion: null, latest: wire }],
      nextAfter: null,
      asOf: 100,
      reminderDays: 30,
      alerts: { expired: 0, expiring: 0, notYetValid: 0 },
    }
    expect((await client.list()).items[0]!.latest.requestVersion).toEqual(requestVersion)
    sample = [wire]
    expect((await client.history(id))[0]!.requestVersion).toEqual(requestVersion)
    for (const invalid of [
      { entryId: 'invalid', version: 1 },
      { entryId: id, version: 0 },
      { entryId: id, version: 1, extra: true },
      undefined,
    ]) {
      sample = [{ ...wire, requestVersion: invalid }]
      await expect(client.history(id)).rejects.toThrow()
    }
    sample = [{ ...wire, extra: true }]
    await expect(client.history(id)).rejects.toThrow()
  },
)
