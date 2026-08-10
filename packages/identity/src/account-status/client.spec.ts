import { describe, expect, it, vi } from 'vitest'
import type { HttpTransport, NoContentRequest, RequestOptions } from '@rss/api'
import { createAccountStatusApi } from './client'

type RecordedRequest = NoContentRequest | RequestOptions<unknown>
const userId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'

function fixture() {
  const calls: RecordedRequest[] = []
  const transport = {
    request: vi.fn(async (request: RecordedRequest) => {
      calls.push(request)
      return request.successStatus === 204
        ? undefined
        : request.decode(
            request.method === 'GET'
              ? { data: { status: 'active' } }
              : { data: { status: 'suspended', changed: true } },
          )
    }),
  } as unknown as HttpTransport
  return { api: createAccountStatusApi(transport), calls, transport }
}

describe('AccountStatusApi', () => {
  it('maps exact GET and idempotent PUT coordinates through the protected transport', async () => {
    const { api, calls } = fixture()
    await expect(api.get(userId)).resolves.toEqual({ data: { status: 'active' } })
    await expect(api.set(userId, { targetStatus: 'suspended' })).resolves.toEqual({
      data: { status: 'suspended', changed: true },
    })

    expect(calls).toEqual([
      expect.objectContaining({
        method: 'GET',
        path: '/api/v1/identity/accounts/{userId}/status',
        pathParams: { userId },
        successStatus: 200,
        session: 'required',
      }),
      expect.objectContaining({
        method: 'PUT',
        path: '/api/v1/identity/accounts/{userId}/status',
        pathParams: { userId },
        body: { targetStatus: 'suspended' },
        successStatus: 200,
        session: 'required',
      }),
    ])
    expect(calls.every((call) => call.headers === undefined)).toBe(true)
  })

  it.each([
    '',
    'F47AC10B-58CC-4372-A567-0E02B2C3D479',
    '00000000-0000-0000-0000-000000000000',
    'f47ac10b58cc4372a5670e02b2c3d479',
  ])('rejects non-canonical userId %j before transport', async (invalid) => {
    const { api, transport } = fixture()
    await expect(api.get(invalid)).rejects.toThrow('canonical non-nil UUID')
    expect(transport.request).not.toHaveBeenCalled()
  })

  it('passes through the exact transport error without retry or fallback', async () => {
    const failure = new Error('sanitized transport failure')
    const transport = { request: vi.fn().mockRejectedValue(failure) } as unknown as HttpTransport
    const api = createAccountStatusApi(transport)
    await expect(api.set(userId, { targetStatus: 'locked' })).rejects.toBe(failure)
    expect(transport.request).toHaveBeenCalledOnce()
  })

  it.each([{ targetStatus: 'unknown' }, { targetStatus: 'active', tenantId: 'attacker' }, null])(
    'rejects an invalid exact request %j before transport',
    async (request) => {
      const { api, transport } = fixture()
      await expect(api.set(userId, request as never)).rejects.toThrow('account status')
      expect(transport.request).not.toHaveBeenCalled()
    },
  )
})
