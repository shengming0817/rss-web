import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createUploadsClient, decodeUpload } from './uploads'
const id = '11111111-1111-4111-8111-111111111111'
const binding = {
  resource: 'app',
  version: '1',
  variant: 'main',
  platform: 'windows',
  architecture: 'x86_64',
  resource_digest: Array(32).fill(1),
  source: { id: 'private', revision: '1', sha256: Array(32).fill(2) },
  origin: null,
  reference: 'installer',
  length: 20000000,
  sha256: Array(32).fill(3),
  actor: 'mdm:operator',
}
const value = { id, binding, offset: 0, expires: 2000000000, complete: false }
it('binds native upload status to resource/session and rejects malformed or cross-target data', () => {
  expect(decodeUpload(value, 'app', id).binding.length).toBe(20000000)
  for (const invalid of [
    { ...value, id: crypto.randomUUID() },
    { ...value, offset: binding.length + 1 },
    { ...value, complete: true },
    { ...value, binding: { ...binding, resource: 'other' } },
    { ...value, binding: { ...binding, secret: 'extra' } },
  ])
    expect(() => decodeUpload(invalid, 'app', id)).toThrow()
})
it('uses native begin/status/append/complete/receipt routes and rejects wrong completion receipts', async () => {
  let reply: unknown = value
  const request = vi.fn(async (options: RequestOptions<unknown>) => options.decode(reply))
  const client = createUploadsClient({ request } as unknown as HttpTransport)
  const target = {
    version: '1',
    variant: 'main',
    platform: 'windows' as const,
    architecture: 'x86_64' as const,
  }
  await client.begin('app', id, target)
  expect(request.mock.calls[0]![0]).toMatchObject({
    method: 'POST',
    path: '/api/v1/resources/{id}/uploads/{upload}',
    query: target,
  })
  reply = { ...value, binding: { ...binding, version: '2' } }
  await expect(client.begin('app', id, target)).rejects.toThrow()
  reply = value
  await client.read('app', id)
  expect(request.mock.lastCall![0].method).toBe('GET')
  const body = new Uint8Array([1, 2, 3]).buffer
  await client.append('app', id, 0, body)
  expect(request.mock.lastCall![0]).toMatchObject({
    method: 'PATCH',
    query: { offset: 0 },
    body,
    headers: { 'Content-Type': 'application/octet-stream' },
  })
  reply = ''
  await client.complete('app', id)
  expect(request.mock.lastCall![0]).toMatchObject({
    method: 'POST',
    path: '/api/v1/resources/{id}/uploads/{upload}/complete',
    successStatus: 201,
  })
  reply = {
    operationId: id,
    committed: true,
    resource: 'app',
    version: '1',
    reference: 'installer',
    length: binding.length,
    sha256: binding.sha256,
  }
  await client.receipt('app', id)
  reply = { ...(reply as object), operationId: crypto.randomUUID() }
  await expect(client.receipt('app', id)).rejects.toThrow()
})
