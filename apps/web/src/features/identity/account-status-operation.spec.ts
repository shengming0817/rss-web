import { describe, expect, it, vi } from 'vitest'
import { decodeWireErrorForTest, networkErrorForTest } from '@rss/api/testing'
import { createAccountStatusOperation } from './account-status-operation'

const userId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, reject, resolve }
}

function fixture() {
  const get = vi.fn().mockResolvedValue({ data: { status: 'active' } })
  const set = vi.fn().mockResolvedValue({ data: { status: 'suspended', changed: true } })
  const invalidate = vi.fn().mockReturnValue(false)
  const operation = createAccountStatusOperation({ get, set, invalidate })
  return { get, invalidate, operation, set }
}

describe('Account Status operation', () => {
  it('starts idle and reads only after an explicit canonical userId submission', async () => {
    const { get, operation } = fixture()
    expect(operation.getState()).toEqual({ status: 'idle' })
    await operation.read(userId)
    expect(get).toHaveBeenCalledOnce()
    expect(get).toHaveBeenCalledWith(userId, expect.objectContaining({ signal: expect.anything() }))
    expect(operation.getState()).toEqual({ status: 'ready', userId, accountStatus: 'active' })
  })

  it('fences a stale read after reset', async () => {
    const pending = deferred<{ data: { status: 'active' } }>()
    const { get, operation } = fixture()
    get.mockReturnValue(pending.promise)
    const read = operation.read(userId)
    operation.reset()
    pending.resolve({ data: { status: 'active' } })
    await read
    expect(operation.getState()).toEqual({ status: 'idle' })
  })

  it('requires confirmation and sends one PUT without a reconcile GET', async () => {
    const { get, operation, set } = fixture()
    await operation.read(userId)
    expect(operation.beginSet('suspended')).toBe(true)
    expect(operation.getState()).toEqual({
      status: 'confirming',
      userId,
      accountStatus: 'active',
      targetStatus: 'suspended',
    })
    await operation.confirmSet()
    expect(set).toHaveBeenCalledOnce()
    expect(set).toHaveBeenCalledWith(
      userId,
      { targetStatus: 'suspended' },
      expect.objectContaining({ signal: expect.anything() }),
    )
    expect(get).toHaveBeenCalledOnce()
    expect(operation.getState()).toEqual({
      status: 'ready',
      userId,
      accountStatus: 'suspended',
      changed: true,
    })
  })

  it('expires self authority on a non-active commit-unknown result', async () => {
    const { invalidate, operation, set } = fixture()
    set.mockRejectedValue(networkErrorForTest())
    invalidate.mockReturnValue(true)
    await operation.read(userId)
    operation.beginSet('locked')
    await operation.confirmSet()

    expect(invalidate).toHaveBeenCalledWith(userId, 'locked')
    expect(operation.getState()).toEqual({ status: 'expired' })
    expect(set).toHaveBeenCalledOnce()
  })

  it('expires self authority after a confirmed non-active response', async () => {
    const { invalidate, operation, set } = fixture()
    invalidate.mockReturnValue(true)
    await operation.read(userId)
    operation.beginSet('suspended')
    await operation.confirmSet()

    expect(set).toHaveBeenCalledOnce()
    expect(invalidate).toHaveBeenCalledWith(userId, 'suspended')
    expect(operation.getState()).toEqual({ status: 'expired' })
  })

  it('keeps authority but clears old facts for a definite 409', async () => {
    const { invalidate, operation, set } = fixture()
    set.mockRejectedValue(
      decodeWireErrorForTest(409, {
        error: {
          code: 'ERR_CORE_CONFLICT',
          message: 'conflict',
          retryable: false,
          details: [],
          requestId: 'account-conflict',
        },
      }),
    )
    await operation.read(userId)
    operation.beginSet('deactivated')
    await operation.confirmSet()

    expect(invalidate).not.toHaveBeenCalled()
    expect(operation.getState()).toMatchObject({ status: 'unavailable', userId })
    expect(operation.getState()).not.toHaveProperty('accountStatus')
  })

  it('invalidates a self non-active write before aborting on dispose', async () => {
    const pending = deferred<{ data: { status: 'locked'; changed: true } }>()
    const { invalidate, operation, set } = fixture()
    let signal: AbortSignal | undefined
    set.mockImplementation((_userId, _request, options) => {
      signal = options.signal
      return pending.promise
    })
    invalidate.mockReturnValue(true)
    await operation.read(userId)
    operation.beginSet('locked')
    const write = operation.confirmSet()
    operation.dispose()

    expect(invalidate).toHaveBeenCalledWith(userId, 'locked')
    expect(signal?.aborted).toBe(true)
    pending.resolve({ data: { status: 'locked', changed: true } })
    await write
    expect(operation.getState()).toEqual({ status: 'expired' })
  })

  it('does not let a second read abort an in-flight write', async () => {
    const pending = deferred<{ data: { status: 'suspended'; changed: true } }>()
    const { get, operation, set } = fixture()
    set.mockReturnValue(pending.promise)
    await operation.read(userId)
    operation.beginSet('suspended')
    const write = operation.confirmSet()

    await operation.read('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(get).toHaveBeenCalledOnce()
    expect(operation.getState()).toEqual({ status: 'writing', userId, targetStatus: 'suspended' })

    pending.resolve({ data: { status: 'suspended', changed: true } })
    await write
    expect(operation.getState()).toEqual({
      status: 'ready',
      userId,
      accountStatus: 'suspended',
      changed: true,
    })
  })
})
