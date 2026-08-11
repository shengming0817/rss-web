import type { HttpTransport } from '@rss/api'
import { createSessionHttpTransport, type SessionTransportHooks } from '@rss/api/session'
import { decodeWireErrorForTest } from '@rss/api/testing'
import { describe, expect, it, vi } from 'vitest'
import { createSettingsApi } from '../client'

const unauthenticated = () =>
  decodeWireErrorForTest(401, {
    error: {
      code: 'ERR_CORE_UNAUTHENTICATED',
      message: 'not exposed',
      retryable: false,
      details: [],
      requestId: 'settings-session-1',
    },
  })

function hooks(): SessionTransportHooks {
  return {
    authorize: vi.fn(() =>
      Promise.resolve({
        bearer: 'settings-access-old',
        generation: 1,
        lifecycleSignal: new AbortController().signal,
      }),
    ),
    recover: vi.fn(() =>
      Promise.resolve({
        bearer: 'settings-access-new',
        generation: 2,
        lifecycleSignal: new AbortController().signal,
      }),
    ),
    invalidate: vi.fn(),
  }
}

describe('Settings session policy', () => {
  it.each([
    [
      'publish',
      (api: ReturnType<typeof createSettingsApi>) => api.publish({ key: 'app.k', value: 'secret' }),
    ],
    [
      'rollback',
      (api: ReturnType<typeof createSettingsApi>) => api.rollback('app.k', { toVersion: 1 }),
    ],
    [
      'secret publish',
      (api: ReturnType<typeof createSettingsApi>) =>
        api.publishSecret({ key: 'vault.db', storeId: 'vault', refKey: 'app/db' }),
    ],
  ])('never recovers or replays a %s after an exact 401', async (_name, invoke) => {
    const delegate = {
      request: vi.fn(() => Promise.reject(unauthenticated())),
    } as unknown as HttpTransport
    const sessionHooks = hooks()
    const api = createSettingsApi(createSessionHttpTransport(delegate, sessionHooks))

    await expect(invoke(api)).rejects.toMatchObject({
      status: 401,
    })
    expect(delegate.request).toHaveBeenCalledOnce()
    expect(sessionHooks.recover).not.toHaveBeenCalled()
    expect(sessionHooks.invalidate).toHaveBeenCalledWith(1)
  })

  it.each([
    {
      name: 'get',
      response: { data: { key: 'app.k', value: 'secret', version: 2 } },
      invoke: (api: ReturnType<typeof createSettingsApi>) => api.get('app.k'),
    },
    {
      name: 'delete',
      response: undefined,
      invoke: (api: ReturnType<typeof createSettingsApi>) => api.delete('app.k'),
    },
    {
      name: 'secret resolve',
      response: { data: { materialBase64: 'bWF0ZXJpYWw=' } },
      invoke: (api: ReturnType<typeof createSettingsApi>) => api.resolveSecret('vault.db'),
    },
  ])(
    'recovers and replays one idempotent $name after an exact 401',
    async ({ response, invoke }) => {
      const delegate = {
        request: vi.fn().mockRejectedValueOnce(unauthenticated()).mockResolvedValueOnce(response),
      } as unknown as HttpTransport
      const sessionHooks = hooks()
      const api = createSettingsApi(createSessionHttpTransport(delegate, sessionHooks))

      await expect(invoke(api)).resolves.toEqual(response)
      expect(delegate.request).toHaveBeenCalledTimes(2)
      expect(sessionHooks.recover).toHaveBeenCalledWith(1, undefined)
      expect(sessionHooks.invalidate).not.toHaveBeenCalled()
    },
  )
})
