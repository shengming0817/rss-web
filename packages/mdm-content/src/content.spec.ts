import { expect, it, vi } from 'vitest'
import { chunkBytes, createContent, hashMaterial } from './index'
import type { ContentPort, UploadIntent, UploadSession } from './model'

const id = '11111111-1111-4111-8111-111111111111'
function intent(length = 1): UploadIntent {
  return {
    id,
    target: {
      resource: 'resource',
      version: 'v1',
      variant: 'main',
      platform: 'windows',
      architecture: 'x86_64',
      artifact: { reference: 'material', length, sha256: Array<number>(32).fill(0) },
    },
  }
}
function session(original = intent()): UploadSession {
  return {
    id,
    target: original.target,
    actor: 'operator',
    resourceDigest: Array<number>(32).fill(9),
    storageClass: 'artifact',
    inspection: null,
    source: null,
    origin: null,
    offset: 0,
    expires: 2000000000,
    complete: false,
  }
}
function port(methods: Partial<ContentPort>): ContentPort {
  return new Proxy(methods as ContentPort, {
    get(target, key) {
      if (!(key in target)) throw new Error(`Unexpected protocol action: ${String(key)}`)
      return Reflect.get(target, key)
    },
  })
}
it('rejects a wrong original target and a receipt for another fixed version', async () => {
  const original = intent(),
    content = createContent(
      port({
        begin: async () => ({
          ...session(),
          target: { ...original.target, architecture: 'aarch64' },
        }),
        receipt: async () => ({
          operationId: id,
          ...original.target.artifact,
          resource: original.target.resource,
          version: 'wrong',
          committed: true,
        }),
      }),
    )
  await expect(content.begin(original)).rejects.toThrow('Wrong original upload session')
  await expect(content.receipt(original)).rejects.toThrow('Wrong original content receipt')
})
it('sends one bounded chunk from the observed frontier and erases its temporary bytes', async () => {
  const original = intent(chunkBytes + 1),
    bytes = new ArrayBuffer(chunkBytes),
    append = vi
      .fn<ContentPort['append']>()
      .mockResolvedValue({ ...session(original), offset: chunkBytes }),
    content = createContent(port({ append })),
    read = vi.fn(async () => bytes)
  new Uint8Array(bytes).fill(7)
  const next = await content.append(original, session(original), { length: chunkBytes + 1, read })
  expect(read).toHaveBeenCalledWith(0, chunkBytes)
  expect(append).toHaveBeenCalledTimes(1)
  expect(next.offset).toBe(chunkBytes)
  expect(new Uint8Array(bytes).every((value) => value === 0)).toBe(true)
})
it('does not replay unknown chunks and rejects an unconfirmed frontier or changed immutable binding', async () => {
  const original = intent(),
    observed = session(),
    append = vi
      .fn<ContentPort['append']>()
      .mockRejectedValueOnce({ status: 409, code: 'offset_conflict' })
      .mockResolvedValueOnce({ ...observed, offset: 0 })
      .mockResolvedValueOnce({ ...observed, offset: 1, origin: 'https://changed.invalid' }),
    content = createContent(port({ append })),
    source = { length: 1, read: async () => new ArrayBuffer(1) }
  await expect(content.append(original, observed, source)).rejects.toMatchObject({
    code: 'offset_conflict',
  })
  expect(append).toHaveBeenCalledTimes(1)
  await expect(content.append(original, observed, source)).rejects.toThrow(
    'Unconfirmed upload frontier',
  )
  await expect(content.append(original, observed, source)).rejects.toThrow('Upload binding changed')
  expect(append).toHaveBeenCalledTimes(3)
})
it('permits explicit completion after storage finish without treating it as a durable receipt', async () => {
  const original = intent(),
    complete = vi.fn<ContentPort['complete']>().mockResolvedValue(undefined),
    receipt = vi.fn<ContentPort['receipt']>().mockRejectedValue({ status: 404, code: 'not_found' }),
    content = createContent(port({ complete, receipt }))
  await content.complete(original, { ...session(), offset: 1, complete: true })
  expect(complete).toHaveBeenCalledTimes(1)
  expect(receipt).not.toHaveBeenCalled()
  await expect(content.receipt(original)).rejects.toMatchObject({ code: 'not_found' })
})
it('hashes bounded source chunks and erases a late chunk after cancellation', async () => {
  const encoded = new Uint8Array(chunkBytes + 1).fill(9),
    expected = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoded))),
    buffers: ArrayBuffer[] = [],
    read = vi.fn(async (offset: number, length: number) => {
      const bytes = encoded.slice(offset, offset + length).buffer
      buffers.push(bytes)
      return bytes
    })
  expect(await hashMaterial({ length: encoded.byteLength, read })).toEqual(expected)
  expect(read.mock.calls.map((call) => call[1])).toEqual([chunkBytes, 1])
  expect(buffers.every((bytes) => new Uint8Array(bytes).every((value) => value === 0))).toBe(true)
  const controller = new AbortController(),
    late = new Uint8Array([7]).buffer
  await expect(
    hashMaterial(
      {
        length: 1,
        read: async () => {
          controller.abort()
          return late
        },
      },
      controller.signal,
    ),
  ).rejects.toThrow('cancelled')
  expect(new Uint8Array(late)).toEqual(new Uint8Array([0]))
})
it('streams verified ranges to a sink, binds If-Range and erases delivered chunks', async () => {
  const original = intent(chunkBytes + 1),
    input = new Uint8Array(chunkBytes + 1).fill(5),
    digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', input))),
    buffers: ArrayBuffer[] = [],
    download = vi.fn<ContentPort['download']>(async (_request, range) => {
      const bytes = input.slice(range.start, range.end + 1).buffer
      buffers.push(bytes)
      return { bytes, start: range.start, end: range.end, total: input.byteLength, etag: 'fixed' }
    }),
    close = vi.fn(async () => {}),
    abort = vi.fn(async () => {}),
    lengths: number[] = [],
    content = createContent(port({ download }))
  await content.download(
    {
      kind: 'software',
      target: { ...original.target, artifact: { ...original.target.artifact, sha256: digest } },
    },
    {
      write: async (bytes) => {
        lengths.push(bytes.byteLength)
      },
      close,
      abort,
    },
  )
  expect(lengths).toEqual([chunkBytes, 1])
  expect(download.mock.calls[1]?.[1]).toEqual({ start: chunkBytes, end: chunkBytes, etag: 'fixed' })
  expect(buffers.every((bytes) => new Uint8Array(bytes).every((value) => value === 0))).toBe(true)
  expect(close).toHaveBeenCalledTimes(1)
  expect(abort).not.toHaveBeenCalled()
})
it('aborts the sink after changed material and refuses an unbounded memory download', async () => {
  const bytes = new Uint8Array([7]).buffer,
    abort = vi.fn(async () => {}),
    close = vi.fn(async () => {}),
    download = vi
      .fn<ContentPort['download']>()
      .mockResolvedValue({ bytes, start: 0, end: 0, total: 1, etag: 'fixed' }),
    content = createContent(port({ download }))
  await expect(
    content.download(
      { kind: 'script', target: intent().target },
      { write: async () => {}, close, abort },
    ),
  ).rejects.toThrow('digest mismatch')
  expect(abort).toHaveBeenCalledTimes(1)
  expect(close).not.toHaveBeenCalled()
  expect(new Uint8Array(bytes)).toEqual(new Uint8Array([0]))
  await expect(
    content.downloadBytes(
      { kind: 'software', target: intent(16 * 1024 * 1024 + 1).target },
      16 * 1024 * 1024,
    ),
  ).rejects.toThrow('small-file budget')
  expect(download).toHaveBeenCalledTimes(1)
})

it('holds the original target and observed frontier while an asynchronous source is read', async () => {
  const original = structuredClone(intent()),
    observed = session(original),
    append = vi
      .fn<ContentPort['append']>()
      .mockResolvedValue(structuredClone({ ...observed, offset: 1 })),
    content = createContent(port({ append }))
  let finish!: (value: ArrayBuffer) => void
  const running = content.append(original, observed, {
    length: 1,
    read: () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  })
  Object.assign(original.target, { version: 'changed-by-caller' })
  Object.assign(observed, { offset: 99 })
  finish(new ArrayBuffer(1))
  await running
  expect(append.mock.calls[0]?.[0].target.version).toBe('v1')
  expect(append.mock.calls[0]?.[1]).toBe(0)
})

it('does not close an unverified sink after cancellation and reports unconfirmed abort cleanup', async () => {
  const controller = new AbortController(),
    bytes = new Uint8Array([7]).buffer,
    download = vi.fn<ContentPort['download']>(async () => {
      controller.abort()
      return { bytes, start: 0, end: 0, total: 1, etag: 'fixed' }
    }),
    close = vi.fn(async () => {}),
    abort = vi.fn(async () => {
      throw new Error('writer unavailable')
    }),
    content = createContent(port({ download }))
  await expect(
    content.download(
      { kind: 'software', target: intent().target },
      { write: async () => {}, close, abort },
      controller.signal,
    ),
  ).rejects.toThrow('Download cleanup unconfirmed')
  expect(close).not.toHaveBeenCalled()
  expect(abort).toHaveBeenCalledTimes(1)
  expect(new Uint8Array(bytes)).toEqual(new Uint8Array([0]))
})
it('rejects a changed ETag between ranges, erases both chunks and aborts instead of confirming a partial file', async () => {
  const original = intent(chunkBytes + 1),
    buffers: ArrayBuffer[] = [],
    download = vi.fn<ContentPort['download']>(async (_request, range) => {
      const bytes = new ArrayBuffer(range.end - range.start + 1)
      buffers.push(bytes)
      return {
        bytes,
        ...range,
        total: original.target.artifact.length,
        etag: range.start ? 'changed' : 'original',
      }
    }),
    write = vi.fn(async () => {}),
    close = vi.fn(async () => {}),
    abort = vi.fn(async () => {}),
    content = createContent(port({ download }))
  await expect(
    content.download({ kind: 'software', target: original.target }, { write, close, abort }),
  ).rejects.toThrow('changed material')
  expect(write).toHaveBeenCalledTimes(1)
  expect(close).not.toHaveBeenCalled()
  expect(abort).toHaveBeenCalledTimes(1)
  expect(buffers.every((buffer) => new Uint8Array(buffer).every((value) => value === 0))).toBe(true)
})

it('binds a software artifact to its content coordinate without retaining source-origin metadata outside the upload binding', async () => {
  const original = intent(),
    artifact = { ...original.target.artifact, origin: 'https://source.example/installer' },
    begin = vi.fn<ContentPort['begin']>().mockResolvedValue(session()),
    content = createContent(port({ begin })),
    selected = content.intent(id, { ...original.target, artifact })
  expect(selected).toEqual(original)
  expect(selected.target.artifact).not.toHaveProperty('origin')
  expect((await content.begin(selected)).target).toEqual(selected.target)
  expect(artifact.origin).toBe('https://source.example/installer')
})
