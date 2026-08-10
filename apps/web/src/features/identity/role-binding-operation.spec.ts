import { describe, expect, it, vi } from 'vitest'
import type { RolesApi } from '@rss/identity'
import { createRoleBindingOperation } from './role-binding-operation'

function api() {
  return {
    list: vi.fn(),
    assign: vi.fn().mockResolvedValue({ data: { assigned: true } }),
    revoke: vi.fn().mockResolvedValue({ data: { revoked: false } }),
  } as unknown as RolesApi
}

describe('role binding operation', () => {
  it('confirms an exact snapshot and retains only a non-authoritative receipt after assign', async () => {
    const roles = api()
    const operation = createRoleBindingOperation(roles)
    operation.prepare('assign', 'ops:admin', 'target@example.test')
    expect(operation.getState()).toEqual({
      status: 'confirming',
      action: 'assign',
      roleId: 'ops:admin',
      subject: 'target@example.test',
    })
    await operation.confirm()
    expect(roles.assign).toHaveBeenCalledWith(
      'ops:admin',
      { subject: 'target@example.test' },
      { signal: expect.any(AbortSignal) },
    )
    expect(operation.getState()).toEqual({
      status: 'receipt',
      action: 'assign',
      result: true,
    })
    expect(JSON.stringify(operation.getState())).not.toContain('target@example.test')
  })

  it('keeps revoked false as a command result without creating binding state', async () => {
    const operation = createRoleBindingOperation(api())
    operation.prepare('revoke', 'ops', 'opaque-subject')
    await operation.confirm()
    expect(operation.getState()).toEqual({ status: 'receipt', action: 'revoke', result: false })
    expect(operation.getState()).not.toHaveProperty('bindings')
  })

  it('cancels without a request and coalesces duplicate confirms', async () => {
    const roles = api()
    const operation = createRoleBindingOperation(roles)
    operation.prepare('assign', 'ops', 'target')
    operation.cancel()
    expect(roles.assign).not.toHaveBeenCalled()
    operation.prepare('assign', 'ops', 'target')
    const first = operation.confirm()
    expect(operation.confirm()).toBe(first)
    await first
    expect(roles.assign).toHaveBeenCalledOnce()
  })

  it('clears stale receipt on every failure and aborts on dispose', async () => {
    let reject!: (error: unknown) => void
    const roles = api()
    vi.mocked(roles.assign).mockImplementation(
      () => new Promise((_, rejectPromise) => (reject = rejectPromise)),
    )
    const operation = createRoleBindingOperation(roles)
    operation.prepare('assign', 'ops', 'sensitive')
    const pending = operation.confirm()
    const signal = vi.mocked(roles.assign).mock.calls[0]?.[2]?.signal
    operation.dispose()
    expect(signal?.aborted).toBe(true)
    reject(new Error('sanitized'))
    await pending
    expect(operation.getState()).toEqual({ status: 'idle' })
  })
})
