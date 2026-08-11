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

  it('fails closed when detail response identity differs from the requested coordinate', async () => {
    const request = vi.fn(async (options: { decode: (value: unknown) => unknown }) =>
      options.decode({
        data: {
          policyId: 'policy-b',
          version: 1,
          contractId: 'identity.policies-get',
          permission: 'identity:policy:read',
          effectiveFrom: 1,
          rules: [],
        },
      }),
    )
    const api = createPoliciesApi({ request } as unknown as HttpTransport)

    await expect(api.get(parsePolicyId('policy-a')!)).rejects.toThrow('invalid policy response')
  })

  it('uses exact protected create, update and deactivate coordinates', async () => {
    const request = vi.fn().mockResolvedValue({ data: {} })
    const api = createPoliciesApi({ request } as unknown as HttpTransport)
    const policyId = parsePolicyId('policy-write')!
    const fields = {
      contractId: 'identity.policies-list',
      permission: 'identity:policy:read',
      effectiveFrom: 1,
      rules: [
        {
          condition: {
            attribute: 'principal.kind',
            operator: {
              family: 'equality' as const,
              predicate: 'eq' as const,
              operand: { kind: 'literal' as const, valueType: 'string' as const, value: 'admin' },
            },
          },
          effect: 'allow' as const,
        },
      ],
    }

    await api.create({ policyId, ...fields })
    await api.update(policyId, { expectedVersion: 1 as never, ...fields })
    await api.deactivate(policyId, { expectedVersion: 2 as never })

    expect(request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        method: 'POST',
        path: '/api/v1/identity/policies',
        successStatus: 201,
        body: { policyId, ...fields },
        session: 'required',
      }),
    )
    expect(request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: 'PUT',
        path: '/api/v1/identity/policies/{policyId}',
        pathParams: { policyId },
        successStatus: 200,
        body: { expectedVersion: 1, ...fields },
        session: 'required',
      }),
    )
    expect(request).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        method: 'POST',
        path: '/api/v1/identity/policies/{policyId}/deactivate',
        pathParams: { policyId },
        successStatus: 200,
        body: { expectedVersion: 2 },
        session: 'required',
      }),
    )
  })
})
