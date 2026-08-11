import type { SettingsApi } from '@rss/settings'
import { networkErrorForTest } from '@rss/api/testing'
import { describe, expect, it, vi } from 'vitest'
import {
  SECRET_MATERIAL_LEASE_MS,
  createSecretMaterialRevealOperation,
} from './secret-material-reveal-operation'

type ResolveSecret = SettingsApi['resolveSecret']

function api(resolveSecret: ResolveSecret): Pick<SettingsApi, 'resolveSecret'> {
  return { resolveSecret }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('Secret material reveal operation', () => {
  it('requires confirmation, drops the key before one request, and keeps material private', async () => {
    const pending = deferred<{ data: { materialBase64: string } }>()
    const resolveSecret = vi.fn().mockReturnValue(pending.promise) as ResolveSecret
    const operation = createSecretMaterialRevealOperation(api(resolveSecret))

    expect(operation.begin('vault.password')).toBe(true)
    expect(operation.getState()).toEqual({ status: 'confirming' })
    expect(resolveSecret).not.toHaveBeenCalled()

    const request = operation.confirm()
    expect(operation.getState()).toEqual({ status: 'resolving' })
    expect(JSON.stringify(operation.getState())).not.toMatch(/vault\.password|c2VjcmV0/)
    expect(resolveSecret).toHaveBeenCalledOnce()
    expect(resolveSecret).toHaveBeenCalledWith(
      'vault.password',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )

    pending.resolve({ data: { materialBase64: 'c2VjcmV0' } })
    await request
    expect(operation.getState()).toEqual({ status: 'active', copy: 'idle' })
    expect(JSON.stringify(operation.getState())).not.toContain('c2VjcmV0')
    const target = document.createElement('code')
    expect(operation.renderActiveInto(target)).toBe(true)
    expect(target.textContent).toBe('c2VjcmV0')
  })

  it('cancels confirmation without resolving and preserves no public coordinate', () => {
    const resolveSecret = vi.fn() as ResolveSecret
    const operation = createSecretMaterialRevealOperation(api(resolveSecret))
    operation.begin('vault.password')
    operation.cancel()

    expect(operation.getState()).toEqual({ status: 'idle' })
    expect(resolveSecret).not.toHaveBeenCalled()
  })

  it('expires the private material after the fixed lease', async () => {
    vi.useFakeTimers()
    try {
      const operation = createSecretMaterialRevealOperation(
        api(vi.fn().mockResolvedValue({ data: { materialBase64: 'AAE=' } }) as ResolveSecret),
      )
      operation.begin('vault.binary')
      await operation.confirm()

      await vi.advanceTimersByTimeAsync(SECRET_MATERIAL_LEASE_MS - 1)
      expect(operation.getState()).toMatchObject({ status: 'active' })
      await vi.advanceTimersByTimeAsync(1)
      expect(operation.getState()).toEqual({ status: 'cleared', reason: 'expired' })
      expect(operation.renderActiveInto(document.createElement('code'))).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('copies only while active and fences a completion after clearing', async () => {
    const copied = deferred<void>()
    const writeText = vi.fn().mockReturnValue(copied.promise)
    const operation = createSecretMaterialRevealOperation(
      api(vi.fn().mockResolvedValue({ data: { materialBase64: '/+8=' } }) as ResolveSecret),
    )
    operation.begin('vault.binary')
    await operation.confirm()

    const copy = operation.copy(writeText)
    expect(writeText).toHaveBeenCalledWith('/+8=')
    operation.clear('manual')
    copied.resolve()
    await copy

    expect(operation.getState()).toEqual({ status: 'cleared', reason: 'manual' })
    expect(JSON.stringify(operation.getState())).not.toContain('/+8=')
  })

  it('publishes only a safe error projection and permits a fresh explicit attempt', async () => {
    const operation = createSecretMaterialRevealOperation(
      api(vi.fn().mockRejectedValue(networkErrorForTest()) as ResolveSecret),
    )
    operation.begin('vault.password')
    await operation.confirm()

    expect(operation.getState()).toEqual({
      status: 'error',
      error: {
        kind: 'serviceUnavailable',
        code: 'NETWORK_ERROR',
        retryable: true,
        recovery: 'retry',
      },
    })
    expect(operation.begin('vault.other')).toBe(true)
  })

  it('aborts and ignores a late response when cleared or disposed', async () => {
    let signal: AbortSignal | undefined
    const pending = deferred<{ data: { materialBase64: string } }>()
    const resolveSecret = vi.fn((_key, options) => {
      signal = options?.signal
      return pending.promise
    }) as unknown as ResolveSecret
    const operation = createSecretMaterialRevealOperation(api(resolveSecret))
    operation.begin('vault.password')
    const request = operation.confirm()
    operation.clear('route')
    expect(signal?.aborted).toBe(true)

    pending.resolve({ data: { materialBase64: 'must-not-activate' } })
    await request
    expect(operation.getState()).toEqual({ status: 'cleared', reason: 'route' })
    expect(operation.renderActiveInto(document.createElement('code'))).toBe(false)

    operation.dispose()
    expect(operation.getState()).toEqual({ status: 'idle' })
  })
})
