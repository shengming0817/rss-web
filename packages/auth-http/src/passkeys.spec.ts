import { expect, it, vi } from 'vitest'
import type { SessionOwner } from '@rss/auth-core'
import type { HttpTransport } from '@rss/api/identity'
import { createOperationAuthorizationPort, createPasskeyClient } from './passkeys'

it('binds passkey authorization to adding, uses current owner credentials and cancels the actual grant', async () => {
  const tenant = '11111111-1111-4111-8111-111111111111'
  const request = vi.fn(async (options: { decode: (value: unknown) => unknown; path: string }) =>
    options.decode(
      options.path.endsWith('cancel')
        ? { cancelled: true }
        : {
            id: tenant,
            options: { publicKey: { challenge: 'challenge' } },
            expires_at: 1_900_000_000,
          },
    ),
  )
  const owner = {
    business: async (work: (credential: { tenant: string; csrf: string }) => Promise<unknown>) =>
      work({ tenant, csrf: 'current-csrf' }),
  } as SessionOwner
  const client = createPasskeyClient({ request } as HttpTransport, owner)
  expect((await client.beginRegistrationAuthorization()).id).toBe(tenant)
  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({
      body: { operation: { kind: 'register' } },
      headers: { 'X-Identity-Request': '1', 'X-CSRF-Token': 'current-csrf' },
    }),
  )
  await client.cancelAuthorization()
  expect(request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      method: 'POST',
      path: '/api/v1/identity/tenants/{tenant}/webauthn/operation/cancel',
      pathParams: { tenant },
    }),
  )
})

it('finishes the actual operation ceremony through the sole session owner and never returns a proof token', async () => {
  const tenant = '11111111-1111-4111-8111-111111111111',
    ceremony = '22222222-2222-4222-8222-222222222222'
  const request = vi.fn(async (options: { decode: (value: unknown) => unknown }) =>
      options.decode({ expiresAt: 1900000000 }),
    ),
    business = vi.fn(
      async (work: (credential: { tenant: string; csrf: string }) => Promise<unknown>) =>
        work({ tenant, csrf: 'current-csrf' }),
    ),
    owner = { business } as unknown as SessionOwner
  const port = createOperationAuthorizationPort({ request } as unknown as HttpTransport, owner)
  expect(
    await port.finish(ceremony, { id: 'browser-credential', response: 'authenticator-response' }),
  ).toBe(1900000000)
  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({
      method: 'POST',
      path: '/api/v1/identity/tenants/{tenant}/webauthn/authenticate/finish',
      pathParams: { tenant },
      headers: { 'X-Identity-Request': '1', 'X-CSRF-Token': 'current-csrf' },
      body: {
        id: ceremony,
        response: { id: 'browser-credential', response: 'authenticator-response' },
      },
    }),
  )
  expect(business).toHaveBeenCalledOnce()
})

it('uses the same strict Identity finish decoder for passkey registration authorization', async () => {
  const tenant = '11111111-1111-4111-8111-111111111111',
    owner = {
      business: async (work: (credential: { tenant: string; csrf: string }) => Promise<unknown>) =>
        work({ tenant, csrf: 'csrf' }),
    } as SessionOwner
  for (const value of [
    { expiresAt: 1900000000, proof: 'must-not-enter-JavaScript' },
    { expiresAt: 9007199254740992 },
    { token: 'invented' },
  ]) {
    const transport = {
      request: async (options: { decode: (value: unknown) => unknown }) => options.decode(value),
    } as HttpTransport
    await expect(
      createOperationAuthorizationPort(transport, owner).finish(tenant, {}),
    ).rejects.toThrow()
    await expect(
      createPasskeyClient(transport, owner).finishOperationAuthorization(tenant, {}),
    ).rejects.toThrow()
  }
})

it('requires a confirmed cancellation response and preserves actual browser cancellation classification', async () => {
  const tenant = '11111111-1111-4111-8111-111111111111',
    owner = {
      business: async (work: (credential: { tenant: string; csrf: string }) => Promise<unknown>) =>
        work({ tenant, csrf: 'csrf' }),
    } as SessionOwner
  const request = vi.fn(async (options: { decode: (value: unknown) => unknown }) =>
      options.decode({ cancelled: false }),
    ),
    port = createOperationAuthorizationPort({ request } as unknown as HttpTransport, owner)
  await expect(port.cancelCeremony(tenant)).rejects.toThrow('unconfirmed')
  await expect(port.cancelAuthorization()).rejects.toThrow('unconfirmed')
  expect(port.classify(new DOMException('cancelled', 'NotAllowedError'))).toBe('cancelled')
  expect(port.classify(new Error('connection lost'))).toBe('unknown')
})
