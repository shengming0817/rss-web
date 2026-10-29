import { expect, it, vi } from 'vitest'
import type { BinaryResponse, HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createContent, type UploadIntent } from '@rss/mdm-content'
import { createContentAdapter } from './content'

const id = '11111111-1111-4111-8111-111111111111',
  hash = () => Array<number>(32).fill(9),
  etag = '"' + '09'.repeat(32) + '"'
function intent(): UploadIntent {
  return {
    id,
    target: {
      resource: 'company/app',
      version: 'v2',
      variant: 'main',
      platform: 'windows',
      architecture: 'x86_64',
      artifact: { reference: 'content/setup.msi', length: 3, sha256: hash() },
    },
  }
}
function session(offset = 0, complete = false) {
  return {
    id,
    offset,
    complete,
    expires: 2000000000,
    binding: {
      actor: 'operator',
      reference: 'content/setup.msi',
      length: 3,
      sha256: hash(),
      purpose: {
        kind: 'resource',
        binding: {
          resource: 'company/app',
          version: 'v2',
          variant: 'main',
          platform: 'windows',
          architecture: 'x86_64',
          resource_digest: hash(),
          storage_class: 'artifact',
          inspection: 'msi',
          source: { id: 'company/source', revision: '1', sha256: hash() },
          origin: 'https://source.example/setup.msi',
        },
      },
    },
  }
}
function fixture(read: (options: RequestOptions<unknown>) => unknown | Promise<unknown>) {
  const request = vi.fn(async (options: RequestOptions<unknown>) =>
    options.decode(await read(options)),
  )
  const adapter = createContentAdapter({ request } as unknown as HttpTransport)
  return { adapter, content: createContent(adapter), request }
}
function binary(overrides: Partial<BinaryResponse> = {}): BinaryResponse {
  return {
    bytes: new Uint8Array([1, 2, 3]).buffer,
    contentType: 'application/octet-stream',
    contentDisposition: null,
    status: 206,
    contentLength: '3',
    contentRange: 'bytes 0-2/3',
    etag,
    ...overrides,
  }
}
it('starts an exact artifact reference without inventing a JSON body and sends only the observed offset on PATCH', async () => {
  const f = fixture((options) => session(options.method === 'PATCH' ? 3 : 0)),
    original = intent(),
    observed = await f.content.begin(original)
  expect(f.request.mock.calls[0]?.[0]).toMatchObject({
    method: 'POST',
    path: '/api/v1/resources/{id}/uploads/{upload}',
    pathParams: { id: 'company/app', upload: id },
    query: {
      version: 'v2',
      variant: 'main',
      platform: 'windows',
      architecture: 'x86_64',
      artifact: 'content/setup.msi',
    },
  })
  expect(f.request.mock.calls[0]?.[0].body).toBeUndefined()
  const bytes = new Uint8Array([1, 2, 3]).buffer
  await f.content.append(original, observed, { length: 3, read: async () => bytes })
  expect(f.request.mock.calls[1]?.[0]).toMatchObject({ method: 'PATCH', query: { offset: 0 } })
  expect(f.request.mock.calls[1]?.[0].headers).not.toHaveProperty('Content-Range')
  expect(new Uint8Array(bytes)).toEqual(new Uint8Array(3))
})
it('requires a fresh explicit read after an offset conflict and permits completion of a storage-finished session', async () => {
  let conflict = true
  const f = fixture((options) => {
      if (options.method === 'PATCH' && conflict) {
        conflict = false
        throw { status: 409, code: 'offset_conflict' }
      }
      return options.path.endsWith('/complete') ? undefined : session(3, true)
    }),
    observed = session(),
    begin = fixture(() => observed),
    original = intent(),
    frontier = await begin.content.begin(original)
  await expect(
    f.content.append(original, frontier, { length: 3, read: async () => new ArrayBuffer(3) }),
  ).rejects.toMatchObject({ status: 409 })
  expect(f.request).toHaveBeenCalledTimes(1)
  const storage = await f.content.read('company/app', id)
  expect(storage.complete).toBe(true)
  await f.content.complete(original, storage)
  expect(f.request.mock.calls.map(([options]) => options.method)).toEqual(['PATCH', 'GET', 'POST'])
  expect(f.request.mock.calls[2]?.[0].path).toBe('/api/v1/resources/{id}/uploads/{upload}/complete')
})
it('binds a durable receipt to the original version and never treats storage completion as a receipt', async () => {
  const f = fixture(() => ({
    operationId: id,
    resource: 'company/app',
    version: 'other',
    reference: 'content/setup.msi',
    length: 3,
    sha256: hash(),
    committed: true,
  }))
  await expect(f.content.receipt(intent())).rejects.toThrow('Wrong original content receipt')
  expect(f.request).toHaveBeenCalledTimes(1)
  expect(f.request.mock.calls[0]?.[0]).toMatchObject({
    method: 'GET',
    path: '/api/v1/resources/{id}/content/operations/{operation}',
    pathParams: { id: 'company/app', operation: id },
  })
})
it('uses the software content route and artifact reference with exact Range/If-Range and supports bounded whole-file 200', async () => {
  const f = fixture(() => binary()),
    request = { kind: 'software' as const, target: intent().target }
  expect((await f.adapter.download(request, { start: 0, end: 2, etag })).bytes.byteLength).toBe(3)
  expect(f.request.mock.calls[0]?.[0]).toMatchObject({
    method: 'GET',
    path: '/api/v1/software/resources/{id}/versions/{version}/content',
    query: {
      variant: 'main',
      platform: 'windows',
      architecture: 'x86_64',
      artifact: 'content/setup.msi',
    },
    headers: { Range: 'bytes=0-2', 'If-Range': etag },
    responseType: 'arraybuffer',
  })
  const whole = fixture(() => binary({ status: 200, contentRange: null }))
  await expect(whole.adapter.download(request, { start: 0, end: 2 })).resolves.toMatchObject({
    total: 3,
  })
  const script = fixture(() => binary())
  await script.adapter.download({ ...request, kind: 'script' }, { start: 0, end: 2 })
  expect(script.request.mock.calls[0]?.[0].path).toBe(
    '/api/v1/resources/{id}/versions/{version}/script',
  )
  expect(script.request.mock.calls[0]?.[0].query).not.toHaveProperty('artifact')
})
it('erases declined download bytes for weak ETags, changed ranges, misleading lengths and full-response fallback', async () => {
  for (const overrides of [
    { etag: 'W/' + etag },
    { contentRange: 'bytes 1-3/4' },
    { contentLength: '4' },
    { status: 200, contentRange: null },
    { contentType: 'text/plain' },
  ]) {
    const result = binary(overrides),
      f = fixture(() => result)
    await expect(
      f.adapter.download({ kind: 'software', target: intent().target }, { start: 1, end: 2 }),
    ).rejects.toThrow()
    expect(new Uint8Array(result.bytes)).toEqual(new Uint8Array(3))
  }
})
it('propagates real authorization and unavailable failures without retrying or downgrading to another download route', async () => {
  for (const failure of [
    { status: 403, code: 'insufficient_privilege' },
    { status: 409, code: 'software_unavailable' },
    { status: 416, code: 'invalid_range' },
  ]) {
    const f = fixture(() => {
      throw failure
    })
    await expect(
      f.adapter.download({ kind: 'software', target: intent().target }, { start: 0, end: 2 }),
    ).rejects.toEqual(failure)
    expect(f.request).toHaveBeenCalledTimes(1)
  }
})
