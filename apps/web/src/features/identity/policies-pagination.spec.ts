import { describe, expect, it, vi } from 'vitest'
import type { PolicyId, PolicyView } from '@rss/identity'
import { createPoliciesPagination } from './policies-pagination'

const policy = (id: string) =>
  ({
    policyId: id as PolicyId,
    version: 1,
    contractId: 'identity.policies-list',
    permission: 'identity:policy:read',
    effectiveFrom: 1,
    rules: [],
  }) satisfies PolicyView

describe('Policies pagination', () => {
  it('loads explicit cursor pages without prefetch', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({ data: [policy('a')], hasMore: true, nextCursor: 'next' })
      .mockResolvedValueOnce({ data: [policy('b')], hasMore: false })
    const pagination = createPoliciesPagination(load)
    await pagination.start()
    expect(load).toHaveBeenCalledTimes(1)
    expect(pagination.getState()).toMatchObject({ status: 'ready', hasMore: true })
    await pagination.next()
    expect(load).toHaveBeenLastCalledWith('next', expect.any(AbortSignal))
    expect(pagination.getState()).toMatchObject({ status: 'ready', hasMore: false })
  })

  it('fails closed on cursor and policy identity drift', async () => {
    const load = vi.fn().mockResolvedValue({
      data: [policy('a'), policy('a')],
      hasMore: true,
      nextCursor: '',
    })
    const pagination = createPoliciesPagination(load)
    await pagination.start()
    expect(pagination.getState()).toMatchObject({ status: 'error', rows: [] })
  })
})
