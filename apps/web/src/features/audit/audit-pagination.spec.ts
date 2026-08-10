import { describe, expect, it, vi } from 'vitest'
import type { AuditEntriesPage, AuditEntry } from '@rss/audit'
import { createAuditPagination } from './audit-pagination'

const row = (seq: number): AuditEntry => ({
  seq,
  tenantId: `tenant-${seq}`,
  actor: `actor-${seq}`,
  actorKind: 'user',
  action: 'audit.read',
  resourceKind: 'entry',
  resourceId: `resource-${seq}`,
  outcome: 'success',
  recordedAt: 1_800_000_000 + seq,
  entryHash: `opaque-${seq}`,
})

describe('audit pagination controller', () => {
  it('appends explicit pages while passing each opaque cursor exactly once', async () => {
    const load = vi
      .fn<(cursor: string | undefined, signal: AbortSignal) => Promise<AuditEntriesPage>>()
      .mockResolvedValueOnce({ data: [row(1)], hasMore: true, nextCursor: 'opaque-a' })
      .mockResolvedValueOnce({ data: [row(2)], hasMore: false })
    const pagination = createAuditPagination(load)

    await pagination.start()
    expect(pagination.getState()).toMatchObject({ status: 'ready', rows: [row(1)], hasMore: true })
    await pagination.next()
    expect(pagination.getState()).toEqual({
      status: 'ready',
      rows: [row(1), row(2)],
      hasMore: false,
    })
    expect(load.mock.calls.map(([cursor]) => cursor)).toEqual([undefined, 'opaque-a'])
  })

  it.each([
    { first: { data: [row(1)], hasMore: true }, reason: 'missing next cursor' },
    {
      first: { data: [row(1)], hasMore: true, nextCursor: 'same' },
      second: { data: [row(2)], hasMore: true, nextCursor: 'same' },
      reason: 'repeated cursor',
    },
    {
      first: { data: [row(1)], hasMore: true, nextCursor: 'next' },
      second: { data: [row(1)], hasMore: false },
      reason: 'duplicate sequence',
    },
  ] satisfies Array<{
    first: AuditEntriesPage
    second?: AuditEntriesPage
    reason: string
  }>)('fails closed for $reason without retaining partial rows', async ({ first, second }) => {
    const load = vi
      .fn<(cursor: string | undefined, signal: AbortSignal) => Promise<AuditEntriesPage>>()
      .mockResolvedValueOnce(first)
    if (second !== undefined) load.mockResolvedValueOnce(second)
    const pagination = createAuditPagination(load)

    await pagination.start()
    if (second !== undefined) await pagination.next()
    expect(pagination.getState()).toMatchObject({ status: 'error', rows: [] })
  })

  it('coalesces repeated next actions into one in-flight request', async () => {
    let resolveNext!: (page: AuditEntriesPage) => void
    const load = vi
      .fn<(cursor: string | undefined, signal: AbortSignal) => Promise<AuditEntriesPage>>()
      .mockResolvedValueOnce({ data: [row(1)], hasMore: true, nextCursor: 'next' })
      .mockImplementationOnce(
        () =>
          new Promise<AuditEntriesPage>((resolve) => {
            resolveNext = resolve
          }),
      )
    const pagination = createAuditPagination(load)
    await pagination.start()

    const first = pagination.next()
    const second = pagination.next()
    expect(load).toHaveBeenCalledTimes(2)
    resolveNext({ data: [row(2)], hasMore: false })
    await Promise.all([first, second])
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('aborts reset work and fences a late completion', async () => {
    let resolve!: (page: AuditEntriesPage) => void
    let signal: AbortSignal | undefined
    const load = vi.fn((_cursor: string | undefined, nextSignal: AbortSignal) => {
      signal = nextSignal
      return new Promise<AuditEntriesPage>((done) => {
        resolve = done
      })
    })
    const pagination = createAuditPagination(load)
    const pending = pagination.start()
    pagination.reset()
    expect(signal?.aborted).toBe(true)
    resolve({ data: [row(1)], hasMore: false })
    await pending
    expect(pagination.getState()).toEqual({ status: 'idle', rows: [] })
  })
})
