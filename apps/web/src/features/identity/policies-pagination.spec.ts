import { describe, expect, it, vi } from 'vitest'
import type { PolicyId, PolicyView } from '@rss/identity'
import { createPoliciesPagination, type PoliciesPaginationState } from './policies-pagination'

const policy = (id: string) =>
  ({
    policyId: id as PolicyId,
    version: 1 as never,
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

  it.each([
    ['empty cursor', { data: [policy('a')], hasMore: true, nextCursor: '' }],
    ['missing cursor', { data: [policy('a')], hasMore: true }],
    ['stale cursor', { data: [policy('a')], hasMore: false, nextCursor: 'stale' }],
    ['duplicate page id', { data: [policy('a'), policy('a')], hasMore: false }],
  ])('fails closed on %s drift', async (_name, page) => {
    const pagination = createPoliciesPagination(vi.fn().mockResolvedValue(page))
    await pagination.start()
    expect(pagination.getState()).toMatchObject({ status: 'error', rows: [] })
  })

  it('fails closed on repeated cursors and cross-page policy identities', async () => {
    const repeatedCursor = createPoliciesPagination(
      vi
        .fn()
        .mockResolvedValueOnce({ data: [policy('a')], hasMore: true, nextCursor: 'next' })
        .mockResolvedValueOnce({ data: [policy('b')], hasMore: true, nextCursor: 'next' }),
    )
    await repeatedCursor.start()
    await repeatedCursor.next()
    expect(repeatedCursor.getState()).toMatchObject({ status: 'error', rows: [] })

    const repeatedPolicy = createPoliciesPagination(
      vi
        .fn()
        .mockResolvedValueOnce({ data: [policy('a')], hasMore: true, nextCursor: 'next' })
        .mockResolvedValueOnce({ data: [policy('a')], hasMore: false }),
    )
    await repeatedPolicy.start()
    await repeatedPolicy.next()
    expect(repeatedPolicy.getState()).toMatchObject({ status: 'error', rows: [] })
  })

  it('aborts and fences stale completions across restart and dispose', async () => {
    let resolveFirst!: (value: { data: PolicyView[]; hasMore: false }) => void
    let resolveSecond!: (value: { data: PolicyView[]; hasMore: false }) => void
    const first = new Promise<{ data: PolicyView[]; hasMore: false }>((resolve) => {
      resolveFirst = resolve
    })
    const second = new Promise<{ data: PolicyView[]; hasMore: false }>((resolve) => {
      resolveSecond = resolve
    })
    const signals: AbortSignal[] = []
    const load = vi.fn((_cursor: string | undefined, signal: AbortSignal) => {
      signals.push(signal)
      return signals.length === 1 ? first : second
    })
    const pagination = createPoliciesPagination(load)
    const firstStart = pagination.start()
    const secondStart = pagination.start()
    expect(signals[0]?.aborted).toBe(true)
    resolveSecond({ data: [policy('current')], hasMore: false })
    await secondStart
    resolveFirst({ data: [policy('stale')], hasMore: false })
    await firstStart
    expect(pagination.getState()).toMatchObject({
      status: 'ready',
      rows: [expect.objectContaining({ policyId: 'current' })],
    })

    const events: PoliciesPaginationState[] = []
    const unsubscribe = pagination.subscribe((state) => events.push(state))
    const pending = pagination.start()
    pagination.dispose()
    expect(signals.at(-1)?.aborted).toBe(true)
    const eventCountAfterDispose = events.length
    resolveSecond({ data: [policy('disposed')], hasMore: false })
    await pending
    expect(events.at(-1)).toMatchObject({ status: 'idle' })
    expect(events).toHaveLength(eventCountAfterDispose)
    unsubscribe()
  })

  it('ignores a rejected request after restart', async () => {
    let rejectFirst!: (error: Error) => void
    const first = new Promise<never>((_resolve, reject) => {
      rejectFirst = reject
    })
    const load = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({ data: [policy('current')], hasMore: false })
    const pagination = createPoliciesPagination(load)
    const stale = pagination.start()
    await pagination.start()
    rejectFirst(new Error('stale failure'))
    await stale
    expect(pagination.getState()).toMatchObject({
      status: 'ready',
      rows: [expect.objectContaining({ policyId: 'current' })],
    })
  })
})
