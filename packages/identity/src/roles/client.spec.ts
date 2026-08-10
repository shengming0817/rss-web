import { describe, expect, it, vi } from 'vitest'
import type { HttpTransport, NoContentRequest, RequestOptions } from '@rss/api'
import { createRolesApi } from './client'

type RecordedRequest = NoContentRequest | RequestOptions<unknown>

function fixture() {
  const calls: RecordedRequest[] = []
  const transport = {
    request: vi.fn(async (request: RecordedRequest) => {
      calls.push(request)
      const value =
        request.method === 'GET'
          ? { data: [], hasMore: false }
          : request.method === 'POST'
            ? { data: { assigned: true } }
            : { data: { revoked: false } }
      return request.successStatus === 204 ? undefined : request.decode(value)
    }),
  } as unknown as HttpTransport
  return { api: createRolesApi(transport), calls, transport }
}

describe('RolesApi', () => {
  it('maps list, non-replayed assign, and idempotent revoke through one session transport', async () => {
    const { api, calls } = fixture()
    await api.list({ limit: 50, cursor: 'opaque' })
    await api.assign('ops:admin', { subject: 'target@example.test' })
    await api.revoke('ops:admin', 'target@example.test')

    expect(calls).toEqual([
      expect.objectContaining({
        method: 'GET',
        path: '/api/v1/identity/roles',
        successStatus: 200,
        query: { limit: 50, cursor: 'opaque' },
        session: 'required',
      }),
      expect.objectContaining({
        method: 'POST',
        path: '/api/v1/identity/roles/{roleId}/bindings',
        pathParams: { roleId: 'ops:admin' },
        body: { subject: 'target@example.test' },
        successStatus: 201,
        session: 'required-no-replay',
      }),
      expect.objectContaining({
        method: 'DELETE',
        path: '/api/v1/identity/roles/{roleId}/bindings/{subject}',
        pathParams: { roleId: 'ops:admin', subject: 'target@example.test' },
        successStatus: 200,
        session: 'required',
      }),
    ])
    expect(calls.every((call) => call.headers === undefined)).toBe(true)
  })

  it.each(['', ' space', 'a/b', 'ü'])(
    'rejects invalid roleId %j before transport',
    async (roleId) => {
      const { api, transport } = fixture()
      await expect(api.assign(roleId, { subject: 'target' })).rejects.toThrow('roleId')
      expect(transport.request).not.toHaveBeenCalled()
    },
  )

  it('rejects an empty subject before transport', async () => {
    const { api, transport } = fixture()
    await expect(api.assign('ops', { subject: '' })).rejects.toThrow('subject')
    await expect(api.revoke('ops', '')).rejects.toThrow('subject')
    expect(transport.request).not.toHaveBeenCalled()
  })

  it('preserves an opaque subject without trimming or normalization', async () => {
    const { api, calls } = fixture()
    await api.assign('ops', { subject: ' target ' })
    expect(calls[0]).toMatchObject({ body: { subject: ' target ' } })
  })

  it.each([0, 501, 1.5])('rejects invalid list limit %j before transport', async (limit) => {
    const { api, transport } = fixture()
    await expect(api.list({ limit })).rejects.toThrow('limit')
    expect(transport.request).not.toHaveBeenCalled()
  })

  it('passes an exact transport error through once without fallback', async () => {
    const failure = new Error('sanitized failure')
    const transport = { request: vi.fn().mockRejectedValue(failure) } as unknown as HttpTransport
    await expect(createRolesApi(transport).assign('ops', { subject: 'target' })).rejects.toBe(
      failure,
    )
    expect(transport.request).toHaveBeenCalledOnce()
  })
})
