import type { ConfigEntry, SettingsApi } from '@rss/settings'
import {
  abortedErrorForTest,
  decodeWireErrorForTest,
  networkErrorForTest,
  protocolErrorForTest,
  timeoutErrorForTest,
} from '@rss/api/testing'
import { describe, expect, it, vi } from 'vitest'
import { createConfigOperation } from './config-operation'

const entry: ConfigEntry = { key: 'app.k', value: 'sensitive-v', version: 2 as never }

function wire(status: number, code: string, message: string, retryable = false) {
  return decodeWireErrorForTest(status, {
    error: { code, message, retryable, details: [], requestId: `config-${status}` },
  })
}

function api(overrides: Partial<SettingsApi> = {}): SettingsApi {
  return {
    get: vi.fn().mockResolvedValue({ data: entry }),
    publish: vi.fn().mockResolvedValue({ data: { key: 'app.k', version: 3 } }),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('Config operation', () => {
  it('reads an authoritative entry and confirms publish without exposing the value in state', async () => {
    const settings = api()
    const operation = createConfigOperation(settings)
    await operation.read('app.k')
    expect(operation.getState()).toEqual({ status: 'ready', entry })
    expect(operation.beginPublish('app.k')).toBe(true)
    expect(operation.getState()).toEqual({ status: 'confirming-publish', key: 'app.k' })
    const promise = operation.confirmPublish('new-sensitive')
    expect(JSON.stringify(operation.getState())).not.toContain('new-sensitive')
    await promise
    expect(settings.publish).toHaveBeenCalledWith(
      { key: 'app.k', value: 'new-sensitive' },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(operation.getState()).toEqual({
      status: 'published',
      coordinate: { key: 'app.k', version: 3 },
    })
  })

  it('turns publish transport ambiguity into value-free unknown and never replays', async () => {
    const failure = networkErrorForTest()
    const publish = vi.fn().mockRejectedValue(failure)
    const operation = createConfigOperation(api({ publish }))
    operation.beginPublish('app.k')
    await operation.confirmPublish('must-disappear')
    expect(publish).toHaveBeenCalledOnce()
    expect(operation.getState()).toEqual({ status: 'unknown', key: 'app.k', error: failure })
    expect(JSON.stringify(operation.getState())).not.toContain('must-disappear')
    expect(operation.beginPublish('app.k')).toBe(false)
    expect(operation.beginDelete('app.k')).toBe(false)
    expect(operation.reset()).toBe(false)
    await operation.read('app.k')
    expect(operation.getState()).toEqual({ status: 'ready', entry })
  })

  it('keeps writes locked when reconciliation fails and only unlocks after an authoritative GET', async () => {
    const reconciliationFailure = networkErrorForTest()
    let rejectReconciliation!: (error: unknown) => void
    const get = vi
      .fn()
      .mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectReconciliation = reject
        }),
      )
      .mockResolvedValueOnce({ data: entry })
    const operation = createConfigOperation(
      api({ get, publish: vi.fn().mockRejectedValue(networkErrorForTest()) }),
    )
    operation.beginPublish('app.k')
    await operation.confirmPublish('secret')

    await operation.read('different.k')
    expect(get).not.toHaveBeenCalled()
    const pendingReconciliation = operation.read('app.k')
    expect(operation.getState()).toEqual({ status: 'reading', key: 'app.k' })
    expect(operation.beginPublish('app.k')).toBe(false)
    expect(operation.beginDelete('app.k')).toBe(false)
    expect(operation.reset()).toBe(false)
    rejectReconciliation(reconciliationFailure)
    await pendingReconciliation
    expect(operation.getState()).toEqual({
      status: 'unknown',
      key: 'app.k',
      error: reconciliationFailure,
    })
    expect(operation.beginPublish('app.k')).toBe(false)
    expect(operation.beginDelete('app.k')).toBe(false)
    expect(operation.reset()).toBe(false)

    await operation.read('app.k')
    expect(get).toHaveBeenCalledTimes(2)
    expect(operation.getState()).toEqual({ status: 'ready', entry })
  })

  it.each([
    [401, wire(401, 'ERR_CORE_UNAUTHENTICATED', 'unauthenticated')],
    [403, wire(403, 'ERR_CORE_FORBIDDEN', 'forbidden')],
    [409, wire(409, 'ERR_CORE_VERSION_CONFLICT', 'version conflict', true)],
    [503, wire(503, 'ERR_CORE_PROVIDER_UNAVAILABLE', 'provider unavailable', true)],
  ])('keeps final wire %s publish failures out of reconciliation', async (_status, failure) => {
    const operation = createConfigOperation(api({ publish: vi.fn().mockRejectedValue(failure) }))
    operation.beginPublish('app.k')
    await operation.confirmPublish('secret')
    expect(operation.getState()).toEqual({
      status: 'error',
      action: 'publish',
      key: 'app.k',
      error: failure,
    })
  })

  it.each([
    ['network', networkErrorForTest()],
    ['timeout', timeoutErrorForTest()],
    ['protocol', protocolErrorForTest(201)],
    ['aborted', abortedErrorForTest()],
    ['internal', wire(500, 'ERR_CORE_INTERNAL', 'internal error')],
    ['budget', wire(503, 'ERR_CORE_UNAVAILABLE', 'service unavailable')],
  ])('requires reconciliation for a %s publish outcome', async (_name, failure) => {
    const operation = createConfigOperation(api({ publish: vi.fn().mockRejectedValue(failure) }))
    operation.beginPublish('app.k')
    await operation.confirmPublish('secret')
    expect(operation.getState()).toEqual({ status: 'unknown', key: 'app.k', error: failure })
  })

  it('confirms delete and fences stale reads after reset', async () => {
    let resolve!: (value: { data: ConfigEntry }) => void
    const get = vi.fn().mockReturnValue(
      new Promise<{ data: ConfigEntry }>((done) => {
        resolve = done
      }),
    )
    const settings = api({ get })
    const operation = createConfigOperation(settings)
    const pending = operation.read('app.k')
    operation.reset()
    resolve({ data: entry })
    await pending
    expect(operation.getState()).toEqual({ status: 'idle' })
    operation.beginDelete('app.k')
    await operation.confirmDelete()
    expect(settings.delete).toHaveBeenCalledOnce()
    expect(operation.getState()).toEqual({ status: 'deleted', key: 'app.k' })
  })
})
