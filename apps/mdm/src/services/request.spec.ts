import { describe, expect, it } from 'vitest'
import { createSession } from '@rss/auth'
import type { HttpTransport, NoContentRequest, RequestOptions } from '@rss/api/mdm'
import { bindSession } from './request'
const tenant = '11111111-1111-4111-8111-111111111111'
const id = '22222222-2222-4222-8222-222222222222'
function setup() {
  const auth = {
    async request(options: RequestOptions<unknown>) {
      return options.decode(
        options.path.endsWith('/context')
          ? {
              tenantId: tenant,
              principalId: id,
              sessionId: id,
              navigation: { manageAccounts: false, manageProviders: false },
            }
          : {
              session: {
                id,
                authTime: 1,
                idleExpiresAt: 4102444800,
                absoluteExpiresAt: 4102444900,
              },
              identity: { principalId: id, hasLocalPassword: true },
              csrfToken: 'a'.repeat(64),
            },
      )
    },
  } as HttpTransport
  return createSession(auth, { canonicalOrigin: 'https://mdm.example.test', oidcEnabled: false })
}
describe('MDM session binding', () => {
  it('uses the same CSRF owner and dispatches each write only once', async () => {
    const session = setup()
    await session.login(tenant, 'user', 'secret')
    let calls = 0
    const business = bindSession(
      {
        async request(options: NoContentRequest | RequestOptions<unknown>) {
          calls++
          expect(options.headers?.['X-CSRF-Token']).toBe('a'.repeat(64))
          throw new Error('business failure')
        },
      } as HttpTransport,
      session,
    )
    await expect(
      business.request({ method: 'POST', path: '/api/v2/devices', successStatus: 204 }),
    ).rejects.toThrow()
    expect(calls).toBe(1)
    expect(session.state.value.status).toBe('authenticated')
    session.clear()
  })
  it('rejects a late business response after logout without changing the new owner', async () => {
    const session = setup()
    await session.login(tenant, 'user', 'secret')
    let finish: (() => void) | undefined
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    let started!: () => void
    const dispatched = new Promise<void>((resolve) => {
      started = resolve
    })
    const business = bindSession(
      {
        request: () => {
          started()
          return pending
        },
      } as HttpTransport,
      session,
    )
    const result = business.request({
      method: 'DELETE',
      path: '/api/v2/devices',
      successStatus: 204,
    })
    await dispatched
    session.clear()
    finish?.()
    await expect(result).rejects.toThrow('Stale response')
  })
  it('refuses anonymous requests before dispatch', async () => {
    const session = setup()
    const business = bindSession(
      {
        request: () => {
          throw new Error('network must not run')
        },
      } as HttpTransport,
      session,
    )
    await expect(
      business.request({
        method: 'GET',
        path: '/api/v2/devices',
        successStatus: 200,
        decode: (v) => v,
      }),
    ).rejects.toThrow('Session required')
  })
})

it('clears authority only on a same-session 401 and preserves caller idempotency keys', async () => {
  const { decodeMdmError } = await import('@rss/api/mdm')
  const session = setup()
  await session.login(tenant, 'user', 'secret')
  const business = bindSession(
    {
      async request(options: NoContentRequest | RequestOptions<unknown>) {
        expect(options.headers?.['Idempotency-Key']).toBe('stable-operation')
        throw decodeMdmError(401, { code: 'invalid_identity' })
      },
    } as HttpTransport,
    session,
  )
  await expect(
    business.request({
      method: 'POST',
      path: '/api/v3/enrollments',
      headers: { 'Idempotency-Key': 'stable-operation' },
      successStatus: 204,
    }),
  ).rejects.toMatchObject({ status: 401 })
  expect(session.state.value.status).toBe('anonymous')
})

it('does not let an old unauthorized response clear a newly accepted session', async () => {
  const { decodeMdmError } = await import('@rss/api/mdm')
  const session = setup()
  await session.login(tenant, 'user', 'secret')
  let reject: ((error: Error) => void) | undefined
  const pending = new Promise<never>((_resolve, fail) => {
    reject = fail
  })
  let started!: () => void
  const dispatched = new Promise<void>((resolve) => {
    started = resolve
  })
  const business = bindSession(
    {
      request: () => {
        started()
        return pending
      },
    } as HttpTransport,
    session,
  )
  const response = business.request({
    method: 'GET',
    path: '/api/v2/devices',
    successStatus: 200,
    decode: (v) => v,
  })
  await dispatched
  session.clear()
  const login = session.login(tenant, 'other', 'secret')
  reject?.(decodeMdmError(401, { code: 'invalid_identity' }))
  await expect(response).rejects.toMatchObject({ status: 401 })
  await login
  expect(session.state.value.status).toBe('authenticated')
  session.clear()
})

it.each([
  [403, 'permission_denied'],
  [409, 'operation_conflict'],
  [503, 'operation_unknown'],
] as const)('preserves authentication for business failure %s', async (status, code) => {
  const { decodeMdmError } = await import('@rss/api/mdm')
  const session = setup()
  await session.login(tenant, 'user', 'secret')
  const business = bindSession(
    { request: () => Promise.reject(decodeMdmError(status, { code })) } as HttpTransport,
    session,
  )
  await expect(
    business.request({
      method: 'GET',
      path: '/api/v2/devices',
      successStatus: 200,
      decode: (v) => v,
    }),
  ).rejects.toMatchObject({ status })
  expect(session.state.value.status).toBe('authenticated')
  session.clear()
})

it.each(['refresh', 'reauthenticate'] as const)(
  'waits for %s before dispatching a business write with the new CSRF',
  async (control) => {
    const session = setup()
    await session.login(tenant, 'user', 'secret')
    const original = session.transport.request
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    session.transport.request = (async (options: RequestOptions<unknown>) => {
      if (options.path.endsWith(`/${control}`)) {
        await gate
        const value = (await original(options)) as { csrfToken: string }
        return { ...value, csrfToken: 'b'.repeat(64) }
      }
      return original(options)
    }) as HttpTransport['request']
    const rotating = control === 'refresh' ? session.refresh() : session.reauthenticate('secret')
    let sent = 0
    const business = bindSession(
      {
        request: async (options: RequestOptions<unknown>) => {
          sent++
          expect(options.headers?.['X-CSRF-Token']).toBe('b'.repeat(64))
        },
      } as HttpTransport,
      session,
    )
    const response = business.request({
      method: 'POST',
      path: '/api/v2/devices',
      successStatus: 204,
    })
    const outcome = response.catch((error: unknown) => error)
    await Promise.resolve()
    const before = sent
    release()
    await rotating
    expect(await outcome).toBeUndefined()
    expect(before).toBe(0)
    expect(sent).toBe(1)
    expect(session.state.value.status).toBe('authenticated')
    session.clear()
  },
)

it('keeps business reads concurrent but drains them before rotating credentials', async () => {
  const session = setup()
  await session.login(tenant, 'user', 'secret')
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let sent = 0
  const business = bindSession(
    {
      request: async () => {
        sent++
        await gate
      },
    } as HttpTransport,
    session,
  )
  const request = { method: 'GET', path: '/api/v2/devices', successStatus: 204 } as const
  const first = business.request(request).catch((error: unknown) => error)
  const second = business.request(request).catch((error: unknown) => error)
  await Promise.resolve()
  expect(sent).toBe(2)
  let rotated = false
  const refresh = session.refresh().then(() => {
    rotated = true
  })
  for (let i = 0; i < 8; i++) await Promise.resolve()
  const before = rotated
  release()
  expect(await first).toBeUndefined()
  expect(await second).toBeUndefined()
  await refresh
  expect(before).toBe(false)
  expect(rotated).toBe(true)
  session.clear()
})
