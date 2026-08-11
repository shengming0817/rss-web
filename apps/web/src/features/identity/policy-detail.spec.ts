import { describe, expect, it, vi } from 'vitest'
import type { PolicyGetResponse, PolicyId, PolicyView } from '@rss/identity'
import { createPolicyDetail } from './policy-detail'

const response = (policyId: PolicyId): PolicyGetResponse => ({
  data: {
    policyId,
    version: 1,
    contractId: 'identity.policies-get',
    permission: 'identity:policy:read',
    effectiveFrom: 1,
    rules: [],
  } as PolicyView,
})

describe('Policy detail state', () => {
  it('loads only an explicit selected server coordinate', async () => {
    const get = vi.fn(async (id: PolicyId) => response(id))
    const detail = createPolicyDetail(get)
    const id = 'policy-a' as PolicyId
    await detail.select(id)
    expect(get).toHaveBeenCalledWith(id, expect.any(AbortSignal))
    expect(detail.getState()).toEqual({ status: 'ready', policy: response(id).data })
  })

  it('does not fall back to a list row after detail failure', async () => {
    const get = vi.fn().mockRejectedValue(new Error('detail failed'))
    const detail = createPolicyDetail(get)
    await detail.select('policy-a' as PolicyId)
    expect(detail.getState()).toMatchObject({ status: 'error' })
    expect(detail.getState()).not.toHaveProperty('policy')
  })
})
