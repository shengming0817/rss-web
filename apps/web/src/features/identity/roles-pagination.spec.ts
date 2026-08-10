import { describe, expect, it, vi } from 'vitest'
import type { RolesListResponse } from '@rss/identity'
import { createRolesPagination } from './roles-pagination'

const role = (roleId: string) => ({ roleId, name: roleId, permissions: [`permission:${roleId}`] })

describe('roles pagination', () => {
  it('loads the first page and appends only on explicit next', async () => {
    const load = vi
      .fn<(cursor: string | undefined, signal: AbortSignal) => Promise<RolesListResponse>>()
      .mockResolvedValueOnce({ data: [role('one')], hasMore: true, nextCursor: 'next' })
      .mockResolvedValueOnce({ data: [role('two')], hasMore: false })
    const pagination = createRolesPagination(load)
    await pagination.start()
    expect(load).toHaveBeenCalledOnce()
    expect(pagination.getState()).toMatchObject({ status: 'ready', rows: [role('one')] })
    await pagination.next()
    expect(load).toHaveBeenLastCalledWith('next', expect.any(AbortSignal))
    expect(pagination.getState()).toMatchObject({
      status: 'ready',
      rows: [role('one'), role('two')],
      hasMore: false,
    })
  })

  it.each([
    { data: [role('one')], hasMore: true },
    { data: [role('one')], hasMore: false, nextCursor: 'stale' },
    { data: [role('one')], hasMore: true, nextCursor: '' },
  ] as RolesListResponse[])('fails closed for cursor drift %#', async (page) => {
    const pagination = createRolesPagination(vi.fn().mockResolvedValue(page))
    await pagination.start()
    expect(pagination.getState()).toMatchObject({ status: 'error', rows: [] })
  })

  it('rejects duplicate role IDs across pages and clears partial catalog', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({ data: [role('one')], hasMore: true, nextCursor: 'next' })
      .mockResolvedValueOnce({ data: [role('one')], hasMore: false })
    const pagination = createRolesPagination(load)
    await pagination.start()
    await pagination.next()
    expect(pagination.getState()).toMatchObject({ status: 'error', rows: [] })
  })

  it('coalesces concurrent next and fences an aborted refresh', async () => {
    let release!: (page: RolesListResponse) => void
    const load = vi
      .fn()
      .mockResolvedValueOnce({ data: [role('one')], hasMore: true, nextCursor: 'next' })
      .mockImplementationOnce(
        () => new Promise<RolesListResponse>((resolve) => (release = resolve)),
      )
      .mockResolvedValueOnce({ data: [role('fresh')], hasMore: false })
    const pagination = createRolesPagination(load)
    await pagination.start()
    const first = pagination.next()
    expect(pagination.next()).toBe(first)
    const refresh = pagination.start()
    release({ data: [role('late')], hasMore: false })
    await first
    await refresh
    expect(pagination.getState()).toMatchObject({ status: 'ready', rows: [role('fresh')] })
  })
})
