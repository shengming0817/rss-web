import { describe, expect, it, vi } from 'vitest'
import type { HttpTransport, NoContentRequest, RequestOptions } from '@rss/api'
import { decodeWireErrorForTest } from '@rss/api/testing'
import { createIdentitySession } from '../session'
import { createRolesApi } from './client'
import { parseRoleId } from './role-id'

type RecordedRequest = NoContentRequest | RequestOptions<unknown>
const NOW = 1_800_000_000
const roleId = parseRoleId('ops:admin')!

function unauthenticated() {
  return decodeWireErrorForTest(401, {
    error: {
      code: 'ERR_CORE_UNAUTHENTICATED',
      message: 'unauthenticated',
      retryable: false,
      details: [],
      requestId: 'roles-rid',
    },
  })
}

async function fixture(targetMethod: 'GET' | 'POST' | 'DELETE') {
  let targetCalls = 0
  let refreshCalls = 0
  const transport = {
    request: vi.fn(async (request: RecordedRequest) => {
      let wire: unknown
      switch (request.path) {
        case '/api/v1/identity/login':
          wire = {
            data: {
              sessionId: 'session-roles',
              expiresAt: NOW + 3_600,
              accessToken: 'access-old',
              refreshToken: 'refresh-old',
              accessExpiresAt: NOW + 60,
            },
          }
          break
        case '/api/v1/identity/profile':
          wire = {
            data: {
              subject: 'roles-user',
              tenantId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
              kind: 'user',
            },
          }
          break
        case '/api/v1/identity/refresh':
          refreshCalls += 1
          wire = {
            data: {
              accessToken: 'access-new',
              refreshToken: 'refresh-new',
              accessExpiresAt: NOW + 120,
            },
          }
          break
        default:
          expect(request.method).toBe(targetMethod)
          targetCalls += 1
          if (targetCalls === 1) throw unauthenticated()
          wire =
            targetMethod === 'GET'
              ? { data: [], hasMore: false }
              : { data: targetMethod === 'POST' ? { assigned: true } : { revoked: true } }
      }
      if (request.successStatus === 204) return undefined
      return request.decode(wire)
    }),
  } as unknown as HttpTransport
  const session = createIdentitySession({ transport, nowEpochSeconds: () => NOW })
  await session.login({ username: 'roles-user', password: 'fixture-password' })
  return {
    api: createRolesApi(session.transport),
    counts: () => ({ refreshCalls, targetCalls }),
    session,
  }
}

describe('Roles session request policy', () => {
  it('does not replay non-idempotent assign after an exact 401', async () => {
    const { api, counts, session } = await fixture('POST')
    await expect(api.assign(roleId, { subject: 'target' })).rejects.toMatchObject({ status: 401 })
    expect(counts()).toEqual({ refreshCalls: 0, targetCalls: 1 })
    expect(session.getState()).toEqual({ status: 'expired' })
  })

  it.each([
    ['list', 'GET'],
    ['revoke', 'DELETE'],
  ] as const)('refreshes once and replays idempotent %s once', async (action, method) => {
    const { api, counts, session } = await fixture(method)
    if (action === 'list') await expect(api.list()).resolves.toMatchObject({ hasMore: false })
    else await expect(api.revoke(roleId, 'target')).resolves.toEqual({ data: { revoked: true } })
    expect(counts()).toEqual({ refreshCalls: 1, targetCalls: 2 })
    expect(session.getState().status).toBe('authenticated')
  })
})
