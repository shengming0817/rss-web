import { describe, expect, it, vi } from 'vitest'
import type { HttpTransport, NoContentRequest, RequestOptions } from '@rss/api'
import { decodeWireErrorForTest } from '@rss/api/testing'
import { createIdentitySession } from '../session'
import { createPoliciesApi } from './client'

type RecordedRequest = NoContentRequest | RequestOptions<unknown>
const NOW = 1_800_000_000

function unauthenticated() {
  return decodeWireErrorForTest(401, {
    error: {
      code: 'ERR_CORE_UNAUTHENTICATED',
      message: 'unauthenticated',
      retryable: false,
      details: [],
      requestId: 'policies-rid',
    },
  })
}

async function fixture(
  targetPath: '/api/v1/identity/policies' | '/api/v1/identity/policies/{policyId}',
) {
  let targetCalls = 0
  let refreshCalls = 0
  const transport = {
    request: vi.fn(async (request: RecordedRequest) => {
      let wire: unknown
      switch (request.path) {
        case '/api/v1/identity/login':
          wire = {
            data: {
              sessionId: 'session-policies',
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
              subject: 'policies-user',
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
          expect(request.path).toBe(targetPath)
          targetCalls += 1
          if (targetCalls === 1) throw unauthenticated()
          wire =
            targetPath === '/api/v1/identity/policies'
              ? { data: [], hasMore: false }
              : {
                  data: {
                    policyId: 'policy-fixture',
                    version: 1,
                    contractId: 'settings.config-get',
                    permission: 'settings.config-get',
                    effectiveFrom: NOW - 60,
                    rules: [],
                  },
                }
      }
      if (request.successStatus === 204) return undefined
      return request.decode(wire)
    }),
  } as unknown as HttpTransport
  const session = createIdentitySession({ transport, nowEpochSeconds: () => NOW })
  await session.login({ username: 'policies-user', password: 'fixture-password' })
  return {
    api: createPoliciesApi(session.transport),
    counts: () => ({ refreshCalls, targetCalls }),
    session,
  }
}

describe('Policies session request policy', () => {
  it.each(['list', 'get'] as const)(
    'refreshes once and replays idempotent %s once',
    async (action) => {
      const targetPath =
        action === 'list' ? '/api/v1/identity/policies' : '/api/v1/identity/policies/{policyId}'
      const { api, counts, session } = await fixture(targetPath)
      if (action === 'list') await expect(api.list()).resolves.toMatchObject({ hasMore: false })
      else {
        // The branded coordinate is normally minted by the decoder. This local fixture exercises the
        // session policy only, while public-api.typecheck.ts prevents callers from forging it.
        await expect(api.get('policy-fixture' as never)).resolves.toMatchObject({
          data: { policyId: 'policy-fixture' },
        })
      }
      expect(counts()).toEqual({ refreshCalls: 1, targetCalls: 2 })
      expect(session.getState().status).toBe('authenticated')
    },
  )
})
