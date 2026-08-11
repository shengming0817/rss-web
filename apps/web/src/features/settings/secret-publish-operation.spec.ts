import type { SettingsApi } from '@rss/settings'
import {
  abortedErrorForTest,
  decodeWireErrorForTest,
  networkErrorForTest,
  protocolErrorForTest,
  timeoutErrorForTest,
} from '@rss/api/testing'
import { describe, expect, it, vi } from 'vitest'
import { createSecretPublishOperation } from './secret-publish-operation'

type PublishSecret = SettingsApi['publishSecret']
type Request = Parameters<PublishSecret>[0]

const request: Request = {
  key: 'service.credential',
  storeId: 'private-store-marker',
  refKey: 'private/ref-marker',
  refVersion: 'private-version-marker',
}

function wire(status: number) {
  return decodeWireErrorForTest(status, {
    error: {
      code: `ERR_SECRET_${status}`,
      message: 'safe fixture failure',
      retryable: false,
      details: [],
      requestId: `secret-${status}`,
    },
  })
}

function api(publishSecret: PublishSecret) {
  return { publishSecret } as Pick<SettingsApi, 'publishSecret'>
}

describe('Secret publish operation', () => {
  it('publishes once without retaining request coordinates in public state', async () => {
    const publishSecret = vi.fn().mockResolvedValue({
      data: { key: 'server.confirmed', version: 7 },
    }) as PublishSecret
    const operation = createSecretPublishOperation(api(publishSecret))

    expect(operation.begin()).toBe(true)
    expect(operation.getState()).toEqual({ status: 'confirming' })
    const pending = operation.confirm(request)
    expect(operation.getState()).toEqual({ status: 'publishing' })
    expect(JSON.stringify(operation.getState())).not.toMatch(
      /private-store|private\/ref|private-version/,
    )
    await pending

    expect(publishSecret).toHaveBeenCalledOnce()
    expect(publishSecret).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(operation.getState()).toEqual({
      status: 'published',
      receipt: { key: 'server.confirmed', version: 7 },
    })
  })

  it.each([400, 401, 403, 404, 409, 413, 429])(
    'treats exact wire %s as a definite safe error',
    async (status) => {
      const failure = wire(status)
      const operation = createSecretPublishOperation(
        api(vi.fn().mockRejectedValue(failure) as PublishSecret),
      )
      operation.begin()
      await operation.confirm(request)
      expect(operation.getState()).toEqual({ status: 'error', error: failure })
      expect(operation.begin()).toBe(true)
    },
  )

  it.each([
    ['network', networkErrorForTest()],
    ['timeout', timeoutErrorForTest()],
    ['aborted', abortedErrorForTest()],
    ['protocol', protocolErrorForTest(201)],
    ['wire-500', wire(500)],
    ['wire-503', wire(503)],
  ])('locks a coordinate-free %s unknown outcome without replay', async (_name, failure) => {
    const publishSecret = vi.fn().mockRejectedValue(failure) as PublishSecret
    const operation = createSecretPublishOperation(api(publishSecret))
    operation.begin()
    await operation.confirm(request)

    expect(operation.getState()).toEqual({ status: 'unknown', error: failure })
    expect(JSON.stringify(operation.getState())).not.toMatch(
      /private-store|private\/ref|private-version/,
    )
    expect(operation.begin()).toBe(false)
    await operation.confirm(request)
    expect(publishSecret).toHaveBeenCalledOnce()
  })

  it('aborts an in-flight request and ignores its late outcome on dispose', async () => {
    let signal: AbortSignal | undefined
    const publishSecret = vi.fn((_request, options) => {
      signal = options?.signal
      return new Promise(() => undefined)
    }) as PublishSecret
    const operation = createSecretPublishOperation(api(publishSecret))
    operation.begin()
    void operation.confirm(request)
    operation.dispose()

    expect(signal?.aborted).toBe(true)
    expect(operation.getState()).toEqual({ status: 'idle' })
  })
})
