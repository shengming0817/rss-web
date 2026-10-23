import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createRecoveryClient, recoveryGrant, issuanceCandidate } from './recovery'
import { readPublicChain } from '../../security/pki/public-chain'
const registration = '11111111-1111-4111-8111-111111111111',
  operation = '22222222-2222-4222-8222-222222222222',
  issuance = '33333333-3333-4333-8333-333333333333'
it('binds administrator recovery to exact original registration/issuance and keeps original signing identity', async () => {
  let reply: unknown = {
    wireVersion: 1,
    grantId: issuance,
    state: 'available',
    expiresAt: 1700000000,
    platform: 'windows',
  }
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply)),
    client = createRecoveryClient({ request } as unknown as HttpTransport)
  const input = {
    wireVersion: 1 as const,
    operationId: operation,
    secret: 'A'.repeat(43),
    platform: 'windows' as const,
    csr: 'YQ==',
  }
  expect(await client.registration(registration, input)).toMatchObject({
    grantId: issuance,
    state: 'available',
  })
  expect(request.mock.lastCall![0]).toMatchObject({
    method: 'POST',
    path: '/api/v1/agent-registrations/{registration}/recovery',
    pathParams: { registration },
    body: input,
  })
  reply = {
    wireVersion: 1,
    issuanceId: issuance,
    operationId: registration,
    certificateChain: ['YQ=='],
    activateBefore: 1700000000,
  }
  expect(await client.issuance(issuance, operation, ['YQ=='])).toMatchObject({
    issuanceId: issuance,
    operationId: registration,
  })
  expect(request.mock.lastCall![0]).toMatchObject({
    method: 'POST',
    path: '/api/v1/agent-issuances/{issuance}/recover',
    pathParams: { issuance },
    body: { wireVersion: 1, operationId: operation, certificateChain: ['YQ=='] },
  })
  expect(() => issuanceCandidate(reply, registration)).toThrow()
})
it('accepts only original public chains and device-generated grant inputs without invented CAS fields', () => {
  expect(readPublicChain('-----BEGIN CERTIFICATE-----\nYQ==\n-----END CERTIFICATE-----')).toEqual([
    'YQ==',
  ])
  expect(readPublicChain('["YQ=="]')).toEqual(['YQ=='])
  for (const input of [
    '-----BEGIN PRIVATE KEY-----\nYQ==\n-----END PRIVATE KEY-----',
    '[]',
    '-----BEGIN CERTIFICATE-----\nYQ==\n-----END CERTIFICATE-----\nsecret',
  ])
    expect(() => readPublicChain(input)).toThrow()
  expect(() =>
    recoveryGrant({
      wireVersion: 1,
      operationId: operation,
      secret: 'A'.repeat(43),
      platform: 'windows',
      csr: 'YQ==',
      generation: 2,
    }),
  ).toThrow()
  expect(() =>
    recoveryGrant({
      wireVersion: 1,
      operationId: operation,
      secret: 'secret',
      platform: 'windows',
      csr: 'YQ==',
    }),
  ).toThrow()
})
it('queries the original administrative operation without confusing its locator with device signing identity', async () => {
  let reply: unknown = null
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply)),
    client = createRecoveryClient({ request } as unknown as HttpTransport)
  expect(await client.operation(issuance, operation)).toBeNull()
  expect(request.mock.lastCall![0]).toMatchObject({
    method: 'GET',
    path: '/api/v1/agent-issuances/{issuance}/recovery-operations/{operation}',
    pathParams: { issuance, operation },
  })
  reply = {
    wireVersion: 1,
    issuanceId: issuance,
    operationId: registration,
    certificateChain: ['YQ=='],
    activateBefore: 1700000000,
  }
  expect((await client.operation(issuance, operation))?.operationId).toBe(registration)
  reply = { ...(reply as object), issuanceId: registration }
  await expect(client.operation(issuance, operation)).rejects.toThrow()
})
