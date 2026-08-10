import { describe, expect, it, vi } from 'vitest'
import type { HttpTransport, NoContentRequest, RequestOptions } from '@rss/api'
import { createIdentityApi } from './client'
import { loginRequestFixture, loginResponseFixture } from '../../test/fixtures/login'
import { refreshRequestFixture, refreshResponseFixture } from '../../test/fixtures/refresh'
import { profileResponseFixture } from '../../test/fixtures/profile'
import { logoutAllResponseFixture, logoutResponseFixture } from '../../test/fixtures/logout'
import {
  passwordChangeRequestFixture,
  passwordChangeResponseFixture,
} from '../../test/fixtures/password-change'

type RecordedRequest = NoContentRequest | RequestOptions<unknown>

function recordingTransport(responses: unknown[]) {
  const calls: RecordedRequest[] = []
  const request = vi.fn((options: RecordedRequest): Promise<unknown> => {
    calls.push(options)
    const response = responses.shift()
    if (options.successStatus === 204) return Promise.resolve(undefined)
    return Promise.resolve(options.decode(response))
  })
  return { calls, transport: { request } as unknown as HttpTransport }
}

describe('createIdentityApi', () => {
  it('maps the six contract methods without adding authority headers', async () => {
    const { calls, transport } = recordingTransport([
      loginResponseFixture,
      refreshResponseFixture,
      profileResponseFixture,
      logoutResponseFixture,
      logoutAllResponseFixture,
      passwordChangeResponseFixture,
    ])
    const api = createIdentityApi(transport)
    const loginWithExtra = { ...loginRequestFixture, extra: 'must-not-be-sent' }

    await expect(api.login(loginWithExtra)).resolves.toEqual(loginResponseFixture)
    await expect(api.refresh(refreshRequestFixture)).resolves.toEqual(refreshResponseFixture)
    await expect(api.profile()).resolves.toEqual(profileResponseFixture)
    await expect(api.logout()).resolves.toEqual(logoutResponseFixture)
    await expect(api.logoutAll()).resolves.toEqual(logoutAllResponseFixture)
    await expect(api.changePassword(passwordChangeRequestFixture)).resolves.toEqual(
      passwordChangeResponseFixture,
    )

    expect(
      calls.map(({ method, path, successStatus, body, headers, session, signal }) => ({
        method,
        path,
        successStatus,
        body,
        headers,
        session,
        signal,
      })),
    ).toEqual([
      {
        method: 'POST',
        path: '/api/v1/identity/login',
        successStatus: 201,
        body: loginRequestFixture,
        headers: undefined,
        session: undefined,
        signal: undefined,
      },
      {
        method: 'POST',
        path: '/api/v1/identity/refresh',
        successStatus: 201,
        body: refreshRequestFixture,
        headers: undefined,
        session: undefined,
        signal: undefined,
      },
      {
        method: 'GET',
        path: '/api/v1/identity/profile',
        successStatus: 200,
        body: undefined,
        headers: undefined,
        session: 'required',
        signal: undefined,
      },
      {
        method: 'POST',
        path: '/api/v1/identity/logout',
        successStatus: 200,
        body: {},
        headers: undefined,
        session: 'required',
        signal: undefined,
      },
      {
        method: 'POST',
        path: '/api/v1/identity/logout-all',
        successStatus: 200,
        body: {},
        headers: undefined,
        session: 'required',
        signal: undefined,
      },
      {
        method: 'POST',
        path: '/api/v1/identity/password/change',
        successStatus: 200,
        body: passwordChangeRequestFixture,
        headers: undefined,
        session: 'required-no-replay',
        signal: undefined,
      },
    ])
  })

  it('accepts only a caller cancellation signal and marks protected methods', async () => {
    const controller = new AbortController()
    const { calls, transport } = recordingTransport([
      loginResponseFixture,
      refreshResponseFixture,
      profileResponseFixture,
      logoutResponseFixture,
      logoutAllResponseFixture,
      passwordChangeResponseFixture,
    ])
    const api = createIdentityApi(transport)

    await api.login(loginRequestFixture, { signal: controller.signal })
    await api.refresh(refreshRequestFixture, { signal: controller.signal })
    await api.profile({ signal: controller.signal })
    await api.logout({ signal: controller.signal })
    await api.logoutAll({ signal: controller.signal })
    await api.changePassword(passwordChangeRequestFixture, { signal: controller.signal })

    expect(calls.map(({ signal, session }) => ({ signal, session }))).toEqual([
      { signal: controller.signal, session: undefined },
      { signal: controller.signal, session: undefined },
      { signal: controller.signal, session: 'required' },
      { signal: controller.signal, session: 'required' },
      { signal: controller.signal, session: 'required' },
      { signal: controller.signal, session: 'required-no-replay' },
    ])
  })

  it('passes sanitized transport errors through without logging secrets', async () => {
    const failure = new Error('sanitized failure')
    const transport = {
      request: vi.fn(() => Promise.reject(failure)),
    } as unknown as HttpTransport
    const logs = [
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
    ]

    await expect(createIdentityApi(transport).login(loginRequestFixture)).rejects.toBe(failure)
    for (const log of logs) expect(log).not.toHaveBeenCalled()
  })
})
