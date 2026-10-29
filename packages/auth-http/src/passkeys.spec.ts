import { expect, it, vi } from 'vitest'
import type { SessionOwner } from '@rss/auth-core'
import type { HttpTransport } from '@rss/api/identity'
import { createPasskeyClient } from './passkeys'

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
