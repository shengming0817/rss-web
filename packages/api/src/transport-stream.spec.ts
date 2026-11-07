import axios from 'axios'
import { expect, it, vi } from 'vitest'
import { execute } from './transport'
import { decodeMdmError } from './mdm'
import type { BinaryResponse, RequestOptions } from './types'

function request(decode: (value: unknown) => unknown = (value) => value): RequestOptions<unknown> {
  return {
    method: 'GET',
    path: '/api/v1/resources/fixed/versions/v1/script',
    responseType: 'arraybuffer',
    headers: { Range: 'bytes=0-1', 'If-Range': '"fixed"' },
    successStatus: [200, 206],
    decode,
  }
}
function fixture(
  stream: ReadableStream<Uint8Array>,
  headers: Record<string, string> = {},
  status = 206,
) {
  const instance = axios.create(),
    call = vi.spyOn(instance, 'request').mockResolvedValue({ data: stream, status, headers })
  return { instance, call }
}
it('rejects an oversized declared full response before reading and cancels the stream', async () => {
  const cancel = vi.fn(),
    pull = vi.fn((controller: ReadableStreamDefaultController<Uint8Array>) =>
      controller.enqueue(new Uint8Array([1, 2])),
    ),
    stream = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 }),
    decode = vi.fn(),
    f = fixture(stream, { 'content-length': '1000000000' }, 200)
  await expect(execute(f.instance, 30000, request(decode), decodeMdmError)).rejects.toMatchObject({
    cause: 'protocol',
  })
  expect(pull).not.toHaveBeenCalled()
  expect(cancel).toHaveBeenCalledTimes(1)
  expect(decode).not.toHaveBeenCalled()
  expect(f.call.mock.calls[0]?.[0]).toMatchObject({
    adapter: 'fetch',
    responseType: 'stream',
    headers: { Range: 'bytes=0-1', 'If-Range': '"fixed"' },
  })
})
it('bounds an undeclared full response at each chunk and erases all received owned bytes', async () => {
  const chunks = [new Uint8Array([1, 2]), new Uint8Array([3])],
    cancel = vi.fn()
  let index = 0
  const f = fixture(
    new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          controller.enqueue(chunks[index++]!)
        },
        cancel,
      },
      { highWaterMark: 0 },
    ),
  )
  await expect(execute(f.instance, 30000, request(), decodeMdmError)).rejects.toMatchObject({
    cause: 'protocol',
  })
  expect(index).toBe(2)
  expect(cancel).toHaveBeenCalledTimes(1)
  expect(chunks.every((chunk) => chunk.every((byte) => byte === 0))).toBe(true)
})
it('transfers verified framing while erasing stream chunks, and wipes the binary buffer after a decoder failure', async () => {
  const chunk = new Uint8Array([1, 2]),
    f = fixture(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(chunk)
          controller.close()
        },
      }),
      {
        'content-length': '2',
        'content-range': 'bytes 0-1/3',
        'content-type': 'application/octet-stream',
        etag: '"fixed"',
      },
    ),
    result = (await execute(f.instance, 30000, request(), decodeMdmError)) as BinaryResponse
  expect(result).toMatchObject({
    status: 206,
    contentLength: '2',
    contentRange: 'bytes 0-1/3',
    etag: '"fixed"',
  })
  expect(new Uint8Array(result.bytes)).toEqual(new Uint8Array([1, 2]))
  expect(chunk).toEqual(new Uint8Array([0, 0]))
  let declined!: ArrayBuffer
  const failure = fixture(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([4, 5]))
        controller.close()
      },
    }),
  )
  await expect(
    execute(
      failure.instance,
      30000,
      request((value) => {
        declined = (value as BinaryResponse).bytes
        throw new Error('wrong binding')
      }),
      decodeMdmError,
    ),
  ).rejects.toMatchObject({ cause: 'protocol' })
  expect(new Uint8Array(declined)).toEqual(new Uint8Array([0, 0]))
})
it('keeps the existing bounded error decoder for a tiny range and rejects truncated declared content', async () => {
  const error = new TextEncoder().encode('{"code":"insufficient_privilege"}'),
    f = fixture(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(error)
          controller.close()
        },
      }),
      { 'content-length': String(error.length) },
      403,
    )
  await expect(execute(f.instance, 30000, request(), decodeMdmError)).rejects.toMatchObject({
    cause: 'wire',
    status: 403,
    code: 'insufficient_privilege',
  })
  const partial = fixture(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]))
        controller.close()
      },
    }),
    { 'content-length': '2' },
  )
  await expect(execute(partial.instance, 30000, request(), decodeMdmError)).rejects.toMatchObject({
    cause: 'protocol',
  })
})
it('cancels a stalled body on caller cancellation and on the same executor deadline', async () => {
  const cancel = vi.fn(),
    first = fixture(new ReadableStream<Uint8Array>({ cancel }, { highWaterMark: 0 })),
    controller = new AbortController(),
    running = execute(
      first.instance,
      30000,
      { ...request(), signal: controller.signal },
      decodeMdmError,
    )
  await Promise.resolve()
  controller.abort()
  await expect(running).rejects.toMatchObject({ cause: 'aborted' })
  expect(cancel).toHaveBeenCalledTimes(1)
  const timeout = fixture(new ReadableStream<Uint8Array>({}, { highWaterMark: 0 }))
  await expect(execute(timeout.instance, 5, request(), decodeMdmError)).rejects.toMatchObject({
    cause: 'timeout',
  })
})

it('rejects an unbounded range before allocating a response buffer or issuing a request', async () => {
  const instance = axios.create(),
    call = vi.spyOn(instance, 'request')
  await expect(
    execute(
      instance,
      30000,
      { ...request(), headers: { Range: 'bytes=0-9007199254740990' } },
      decodeMdmError,
    ),
  ).rejects.toMatchObject({ cause: 'client' })
  expect(call).not.toHaveBeenCalled()
})

it('retains an MDM request UUID on enforced same-origin browser ranges only', async () => {
  const origin = 'https://rss-web.test'
  const id = '11111111-1111-4111-8111-111111111111'
  vi.stubGlobal('location', { origin })
  try {
    for (const mode of ['same-origin', 'cors'] as const) {
      const instance = axios.create()
      const bytes = new TextEncoder().encode(JSON.stringify({ code: 'permission_denied' }))
      const call = vi.spyOn(instance, 'request').mockResolvedValue({
        data: new ReadableStream({
          start(controller) {
            controller.enqueue(bytes)
            controller.close()
          },
        }),
        headers: { 'X-Request-Id': id },
        status: 403,
        request: new Request(origin + '/api/v1/resources/r', { mode }),
      })
      const result = execute(instance, 30000, request(), decodeMdmError, true)
      if (mode === 'same-origin') await expect(result).rejects.toMatchObject({ requestId: id })
      else await expect(result).rejects.not.toHaveProperty('requestId')
      expect(call.mock.calls[0]?.[0]).toMatchObject({ fetchOptions: { mode: 'same-origin' } })
    }
  } finally {
    vi.unstubAllGlobals()
  }
})

it('retains received request metadata after a same-origin stream fails', async () => {
  const origin = 'https://rss-web.test'
  const id = '11111111-1111-4111-8111-111111111111'
  vi.stubGlobal('location', { origin })
  try {
    const instance = axios.create()
    vi.spyOn(instance, 'request').mockResolvedValue({
      data: new ReadableStream({
        start(controller) {
          controller.error(new Error('connection interrupted'))
        },
      }),
      headers: { 'X-Request-Id': id },
      status: 206,
      request: new Request(origin + '/api/v1/resources/r', { mode: 'same-origin' }),
    })
    await expect(execute(instance, 30000, request(), decodeMdmError, true)).rejects.toMatchObject({
      cause: 'network',
      requestId: id,
    })
  } finally {
    vi.unstubAllGlobals()
  }
})
