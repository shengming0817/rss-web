import { describe, expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api'
import { createAuditApi } from './client'
import { decodeAuditEntriesPage } from './decoders'

const entry = {
  seq: 0,
  tenantId: '<redacted>',
  actor: '<redacted>',
  actorKind: 'user',
  action: 'login',
  resourceKind: 'session',
  resourceId: '<redacted>',
  outcome: 'success',
  recordedAt: 1_800_000_000,
  entryHash: 'opaque:not-validated',
}

describe('audit entries decoder', () => {
  it('preserves projected fields and the opaque hash', () => {
    expect(decodeAuditEntriesPage({ data: [entry], hasMore: true, nextCursor: 'next' })).toEqual({
      data: [entry],
      hasMore: true,
      nextCursor: 'next',
    })
  })

  it('decodes an empty terminal page without inventing a cursor', () => {
    expect(decodeAuditEntriesPage({ data: [], hasMore: false })).toEqual({
      data: [],
      hasMore: false,
    })
  })

  it.each([
    { data: [{ ...entry, seq: Number.MAX_SAFE_INTEGER + 1 }], hasMore: false },
    { data: [{ ...entry, extra: true }], hasMore: false },
    { data: [entry], hasMore: false, extra: true },
    { data: 'not-an-array', hasMore: false },
    { data: [entry], hasMore: 'false' },
    { data: [{ ...entry, actor: 42 }], hasMore: false },
    null,
  ])('fails closed for page or entry drift %#', (fixture) => {
    expect(() => decodeAuditEntriesPage(fixture)).toThrow('invalid audit entries response')
  })
})

describe('audit client', () => {
  it('maps limit/cursor/signal without tenant input', async () => {
    const signal = new AbortController().signal
    const response = { data: [entry], hasMore: false }
    const request = vi.fn(async (options: RequestOptions<unknown>) => options.decode(response))
    const api = createAuditApi({ request } as unknown as HttpTransport)
    await expect(api.listEntries({ limit: 10, cursor: 'c', signal })).resolves.toEqual(response)
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/api/v1/audit/entries',
        successStatus: 200,
        session: 'required',
        query: { limit: 10, cursor: 'c' },
        signal,
      }),
    )
    expect(request.mock.calls[0]?.[0]).not.toHaveProperty('headers')
    expect(request.mock.calls[0]?.[0]).not.toHaveProperty('pathParams')

    await api.listEntries()
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: { limit: undefined, cursor: undefined } }),
    )
    expect(request.mock.calls[1]?.[0]).not.toHaveProperty('signal')
  })

  it.each([0, 501, 1.5])('rejects invalid limit %s before transport', async (limit) => {
    const request = vi.fn()
    const api = createAuditApi({ request } as unknown as HttpTransport)
    await expect(api.listEntries({ limit })).rejects.toThrow('audit limit')
    expect(request).not.toHaveBeenCalled()
  })
})
