import {
  validateAccountOrganization,
  validateAdeConfiguration,
  validateAgentSettings,
  configurationIntent,
  createAppleEnrollment,
  createEnrollment,
  nativeIntent,
  validateConfigurationUsage,
  windowsEnrollmentLink,
} from './index'
import { expect, it, vi } from 'vitest'
import type { AppleEnrollmentPort, Configuration, EnrollmentPort } from './model'
const tenant = '11111111-1111-4111-8111-111111111111',
  principal = '22222222-2222-4222-8222-222222222222',
  operationId = '33333333-3333-4333-8333-333333333333',
  id = '44444444-4444-4444-8444-444444444444'
const configuration: Configuration = {
  configurationId: id,
  tenantId: tenant,
  serviceId: id,
  connectionRevision: 3,
  preferredOrigin: 'https://agent.example',
  origins: ['https://agent.example'],
  targets: [{ platform: 'windows', architecture: 'x86_64' }],
  expiresAt: 1000,
  quantity: { kind: 'finite', count: 4 },
  keyId: 'public-key',
}
it('does not turn quota usage into a browser authorization check or retry a rejected native request', async () => {
  const createNative = vi.fn(async () => {
      throw { status: 403, code: 'registration_limit' }
    }),
    usage = vi.fn(),
    selfOptions = vi.fn()
  const service = createEnrollment(
    { createNative, usage, selfOptions } as unknown as EnrollmentPort,
    tenant,
    principal,
  )
  const intent = nativeIntent(operationId, 'mdm.windows', 'Full')
  await expect(service.createNative(intent, 'A'.repeat(43))).rejects.toMatchObject({
    code: 'registration_limit',
  })
  expect(createNative).toHaveBeenCalledTimes(1)
  expect(usage).not.toHaveBeenCalled()
  expect(selfOptions).not.toHaveBeenCalled()
  expect(intent).not.toHaveProperty('password')
  expect(() => nativeIntent(operationId, 'agent.builtin' as 'mdm.windows', 'Full')).toThrow()
})
it('retains a secret-free immutable configuration intent and validates remaining allocation facts', () => {
  const intent = configurationIntent({
    operationId,
    lifetimeSeconds: null,
    quantity: configuration.quantity,
    targets: configuration.targets,
  })
  expect(Object.keys(intent).sort()).toEqual([
    'lifetimeSeconds',
    'operationId',
    'quantity',
    'targets',
  ])
  expect(Object.isFrozen(intent.targets[0])).toBe(true)
  expect(() =>
    validateConfigurationUsage({ configuration, reserved: 1, consumed: 2, remaining: 1 }),
  ).not.toThrow()
  expect(() =>
    validateConfigurationUsage({ configuration, reserved: 1, consumed: 2, remaining: 3 }),
  ).toThrow()
  expect(() =>
    validateConfigurationUsage({
      configuration: { ...configuration, quantity: { kind: 'unlimited' } },
      reserved: 1,
      consumed: 20,
      remaining: null,
    }),
  ).not.toThrow()
  expect(() => configurationIntent({ ...intent, quantity: { kind: 'finite', count: 0 } })).toThrow()
})
it('erases an unexpected issued document and never retains it as a confirmed receipt', async () => {
  const bytes = new Uint8Array([1, 2, 3]).buffer,
    issueConfiguration = vi.fn(async () => ({
      configuration: { ...configuration, tenantId: principal },
      file: { bytes, filename: 'rss-agent-enrollment.json', contentType: 'application/json' },
    }))
  const service = createEnrollment(
    { issueConfiguration } as unknown as EnrollmentPort,
    tenant,
    principal,
  )
  await expect(
    service.issueConfiguration(
      configurationIntent({
        operationId,
        targets: configuration.targets,
        quantity: configuration.quantity,
        lifetimeSeconds: 60,
      }),
      'A'.repeat(43),
    ),
  ).rejects.toThrow('Wrong issued configuration')
  expect([...new Uint8Array(bytes)]).toEqual([0, 0, 0])
  expect(issueConfiguration).toHaveBeenCalledTimes(1)
})
it('requires a new terms version for changed text while preserving explicit new policy authoring', () => {
  const service = createEnrollment({} as EnrollmentPort, tenant, principal),
    policy = {
      enabled: true,
      allUsers: true,
      users: [],
      termsVersion: 'v1',
      termsText: 'Terms',
      allowBackground: false,
    }
  expect(() =>
    service.prepareEntra(operationId, { revision: 2, policy }, { ...policy, termsText: 'Changed' }),
  ).toThrow('new version')
  expect(
    service.prepareEntra(
      operationId,
      { revision: 2, policy },
      { ...policy, termsText: 'Changed', termsVersion: 'v2' },
    ).expectedRevision,
  ).toBe(2)
})
it('requires complete default quotas, allows inherited user quotas, and checks the CAS receipt', async () => {
  const saveQuota = vi.fn(async () => ({
      revision: 9,
      limits: { agent: null, windows_mdm: 0, macos_mdm: null },
    })),
    service = createEnrollment({ saveQuota } as unknown as EnrollmentPort, tenant, principal),
    limits = { agent: null, windows_mdm: 0, macos_mdm: null }
  await expect(service.saveQuota(null, operationId, 8, limits)).rejects.toThrow(
    'Invalid quota limit',
  )
  expect(saveQuota).not.toHaveBeenCalled()
  expect(
    (
      await service.saveQuota(
        { tenantId: tenant, instanceId: id, principalId: principal },
        operationId,
        8,
        limits,
      )
    ).revision,
  ).toBe(9)
})
it('keeps the Windows native handoff tied to the server-issued protocol identity', () => {
  const link = windowsEnrollmentLink({
    platform: 'windows',
    server: 'https://enroll.example',
    discoveryUrl: 'https://enroll.example/discover',
    username: 'server-protocol-identity',
    windowsProfile: 'Full',
    requiresLocalAdministrator: true,
  })
  expect(link).toContain('username=server-protocol-identity')
  expect(windowsEnrollmentLink({ platform: 'unavailable' })).toBeNull()
})
it('sends one explicit ADE command and does not turn an unknown result into automatic reconcile', async () => {
  const adeCommand = vi.fn(async () => {
      throw { status: 503, code: 'operation_unknown' }
    }),
    service = createAppleEnrollment({ adeCommand } as unknown as AppleEnrollmentPort)
  await expect(
    service.adeCommand(id, operationId, {
      kind: 'assign',
      profile: principal,
      revision: 3,
      devices: ['SERIAL-1'],
    }),
  ).rejects.toMatchObject({ code: 'operation_unknown' })
  expect(adeCommand).toHaveBeenCalledTimes(1)
})

it('rejects local authoring failures before a caller freezes an HTTP intent', () => {
  expect(() =>
    validateAccountOrganization({
      expectedRevision: 0,
      domain: 'example.test',
      serverUuid: id,
      signingKey: '   ',
      enabled: false,
    }),
  ).toThrow('Missing signing key alias')
  expect(() =>
    validateAdeConfiguration({
      expectedRevision: 0,
      serverUuid: id,
      orgId: '   ',
      enabled: false,
      rotateKey: false,
    }),
  ).toThrow('Missing organization identity')
  expect(() =>
    validateAgentSettings({
      grantSeconds: 1.5,
      configurationDefaultSeconds: 3600,
      platforms: ['windows'],
    }),
  ).toThrow('Invalid Agent enrollment settings')
})
