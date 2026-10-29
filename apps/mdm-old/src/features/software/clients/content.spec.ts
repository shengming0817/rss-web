import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createSoftwareContentClient } from './content'
it('downloads only exact private content coordinates using the injected session transport', async () => {
  const bytes = new Uint8Array([1, 2, 3]).buffer
  const request = vi.fn(async (o: RequestOptions<unknown>) =>
    o.decode({ bytes, contentType: 'application/octet-stream', contentDisposition: null }),
  )
  const client = createSoftwareContentClient({ request } as unknown as HttpTransport)
  expect(
    await client.read('app', {
      version: 'v1',
      platform: 'windows',
      architecture: 'aarch64',
      variant: 'enterprise',
      artifact: 'installer',
    }),
  ).toBe(bytes)
  expect(request.mock.calls[0]?.[0]).toMatchObject({
    method: 'GET',
    path: '/api/v1/software/resources/{id}/versions/{version}/content',
    pathParams: { id: 'app', version: 'v1' },
    query: {
      platform: 'windows',
      architecture: 'aarch64',
      variant: 'enterprise',
      artifact: 'installer',
    },
    responseType: 'arraybuffer',
  })
})
