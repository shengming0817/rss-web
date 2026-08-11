import { describe, expect, it, vi } from 'vitest'
import type { HttpTransport } from '@rss/api'
import { createPoliciesApi } from './client'
import { parsePolicyId } from './policy-id'

describe('Policies API', () => {
  it('uses exact protected list and detail coordinates without authority headers', async () => {
    const request = vi.fn().mockResolvedValue({ data: [], hasMore: false })
    const api = createPoliciesApi({ request } as unknown as HttpTransport)
    await api.list({ limit: 50, cursor: 'opaque' })
    const policyId = parsePolicyId('policy-read')!
    await api.get(policyId)

    expect(request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        method: 'GET',
        path: '/api/v1/identity/policies',
        successStatus: 200,
        query: { limit: 50, cursor: 'opaque' },
        session: 'required',
      }),
    )
    expect(request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: 'GET',
        path: '/api/v1/identity/policies/{policyId}',
        pathParams: { policyId },
        successStatus: 200,
        session: 'required',
      }),
    )
    expect(request.mock.calls.flat()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ headers: expect.anything() })]),
    )
  })

  it('rejects invalid list input before transport', async () => {
    const request = vi.fn()
    const api = createPoliciesApi({ request } as unknown as HttpTransport)
    await expect(api.list({ limit: 501 })).rejects.toThrow('invalid policies list input')
    expect(request).not.toHaveBeenCalled()
  })
})
