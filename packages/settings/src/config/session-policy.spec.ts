import type { HttpTransport } from '@rss/api'
import { createSessionHttpTransport, type SessionTransportHooks } from '@rss/api/session'
import { decodeWireErrorForTest } from '@rss/api/testing'
import { describe, expect, it, vi } from 'vitest'
import { createSettingsApi } from './client'

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
  it('never recovers or replays a publish after an exact 401', async () => {
    const delegate = {
      request: vi.fn(() => Promise.reject(unauthenticated())),
    } as unknown as HttpTransport
    const sessionHooks = hooks()
    const api = createSettingsApi(createSessionHttpTransport(delegate, sessionHooks))

    await expect(api.publish({ key: 'app.k', value: 'secret' })).rejects.toMatchObject({
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
