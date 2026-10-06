import { beforeEach, expect, it } from 'vitest'
import type { HttpTransport, RequestOptions, NoContentRequest } from '@rss/api/mdm'
import { decodeMdmError } from '@rss/api/mdm'
import { createOnboardingDemo } from '../../../../demo/enrollment'
import { TENANT } from '../../../../demo/scenario'
import { INSTANCE, ADMIN } from '../../../../demo/operations/authorization'
import { createOnboardingClients } from '../client'
import { generateEnrollmentPassword } from '../../devices/clients/enrollment'
import { quantity, readConfiguration } from './configurations'
import { adeOperation, adeStatus, appleOrganizations, setup } from './apple'
import { entraPolicy, termsContext, text } from './entra'
let domain: ReturnType<typeof createOnboardingDemo>,
  client: ReturnType<typeof createOnboardingClients>,
  actor = ADMIN
const operation = () => crypto.randomUUID()
beforeEach(() => {
  actor = ADMIN
  domain = createOnboardingDemo((principal) => principal === ADMIN)
  const transport = {
    async request<T>(o: RequestOptions<T> | NoContentRequest) {
      const path = o.path.replace(/\{([^}]+)\}/g, (_m, key: string) =>
        encodeURIComponent(o.pathParams?.[key] ?? ''),
      )
      const reply = domain.handle(
        {
          method: o.method,
          path,
          body: o.body,
          query: new URLSearchParams(
            Object.entries(o.query ?? {})
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => [k, String(v)]),
          ),
          headers: Object.fromEntries(
            Object.entries(o.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
          ),
          actor: { principalId: actor, sessionId: ADMIN },
        },
        'normal',
      )!
      if (reply.status !== o.successStatus) throw decodeMdmError(reply.status, reply.body)
      if (o.successStatus === 204) return undefined
      const binary =
        o.responseType === 'arraybuffer'
          ? new ArrayBuffer((reply.body as ArrayBuffer).byteLength)
          : undefined
      if (binary) new Uint8Array(binary).set(new Uint8Array(reply.body as ArrayBuffer))
      return o.decode(
        o.responseType === 'arraybuffer'
          ? {
              bytes: binary,
              contentType: reply.headers?.['Content-Type'],
              contentDisposition: reply.headers?.['Content-Disposition'],
            }
          : reply.body,
      )
    },
  } as HttpTransport
  client = createOnboardingClients(transport, transport, TENANT)
})
it('delivers the complete exact JSON, looks up only secret-free outcomes and revokes before replacement', async () => {
  const initial = await client.configurations.settings()
  expect(initial.configurationFilename).toBe('rss-agent-enrollment.json')
  expect(
    (
      await client.configurations.saveSettings(operation(), initial.revision, {
        ...initial.values,
        configurationDefaultSeconds: 31536000,
      })
    ).values.configurationDefaultSeconds,
  ).toBe(31536000)
  const op = operation(),
    secret = generateEnrollmentPassword()
  const delivered = await client.configurations.create({
    operationId: op,
    secret,
    lifetimeSeconds: null,
    quantity: { kind: 'finite', count: 3 },
    targets: [{ platform: 'macos', architecture: 'aarch64' }],
    channels: ['production'],
  })
  expect(JSON.parse(new TextDecoder().decode(delivered.file.bytes)).secret).toBe(secret)
  const found = await client.configurations.operation(op)
  expect(found?.remaining).toBe(3)
  expect(JSON.stringify(found)).not.toContain(secret)
  expect(await client.configurations.operation(operation())).toBeNull()
  await client.configurations.revoke(delivered.configuration.configurationId, operation())
  expect((await client.configurations.read(delivered.configuration.configurationId)).state).toBe(
    'revoked',
  )
  expect(() => readConfiguration({ ...found, remaining: 0 }, TENANT)).toThrow()
  expect(() => readConfiguration(found, INSTANCE)).toThrow()
  for (const invalid of [
    { kind: 'finite', count: 0 },
    { kind: 'finite', count: -1 },
    { kind: 'unlimited', count: 0 },
    { kind: 'automatic' },
  ])
    expect(() => quantity(invalid)).toThrow()
  actor = INSTANCE
  await expect(
    client.configurations.read(delivered.configuration.configurationId),
  ).rejects.toMatchObject({ status: 403 })
})
it('keeps unlimited quantity null and rejects altered scope or secret-free pseudo-files', async () => {
  const file = await client.configurations.create({
    operationId: operation(),
    secret: generateEnrollmentPassword(),
    lifetimeSeconds: 30,
    quantity: { kind: 'unlimited' },
    targets: [{ platform: 'windows', architecture: 'x86_64' }],
    channels: ['test'],
  })
  expect(
    (await client.configurations.read(file.configuration.configurationId)).remaining,
  ).toBeNull()
  expect(() =>
    readConfiguration(
      {
        configuration: file.configuration,
        state: 'available',
        createdBy: ADMIN,
        responsibleUser: null,
        reserved: 0,
        consumed: 0,
        remaining: 0,
      },
      TENANT,
    ),
  ).toThrow()
})
it('uses independent Apple organization configurations and immutable write receipts', async () => {
  const id = operation(),
    server = operation()
  expect(await client.apple.organizations()).toEqual([])
  expect(
    await client.apple.accountOrganization(id, operation(), {
      expectedRevision: 0,
      domain: 'example.test',
      serverUuid: server,
      signingKey: 'account',
      enabled: true,
    }),
  ).toBe(1)
  expect(
    await client.apple.accountMapping(id, 'managed@example.test', operation(), {
      expectedRevision: 0,
      principalId: ADMIN,
      instanceId: INSTANCE,
      enabled: true,
    }),
  ).toBe(1)
  const organizations = await client.apple.organizations()
  expect(organizations[0]?.accountEnrollment?.accounts[0]?.principalId).toBe(ADMIN)
  expect(organizations[0]?.ade).toBeNull()
  await expect(
    client.apple.accountOrganization(id, operation(), {
      expectedRevision: 0,
      domain: 'example.test',
      serverUuid: server,
      signingKey: 'account',
      enabled: true,
    }),
  ).rejects.toMatchObject({ status: 409 })
  expect(() => appleOrganizations({ items: [{ ...organizations[0], extra: true }] })).toThrow()
  await client.apple.configure(id, operation(), {
    expectedRevision: 0,
    enabled: true,
    serverUuid: server,
    orgId: 'ORG',
    rotateKey: false,
  })
  expect((await client.apple.ade(id)).tokenState).toBe('missing')
  const token = operation()
  await client.apple.command(id, token, { kind: 'token', expectedRevision: 1, p7m: 'synthetic' })
  expect((await client.apple.operation(id, token)).state).toBe('succeeded')
  expect((await client.apple.ade(id)).tokenState).toBe('verified')
  await expect(client.apple.publicKey(id)).rejects.toMatchObject({ status: 501 })
  expect(await client.apple.devices(id)).toEqual({ items: [], nextCursor: null })
  const profile = operation(),
    op = operation()
  await client.apple.command(id, op, {
    kind: 'profile',
    id: profile,
    expectedRevision: 0,
    configuration: { name: 'Corporate', mandatory: true, removable: false, skip: ['AppleID'] },
  })
  expect((await client.apple.operation(id, op)).state).toBe('pending')
  domain.tick()
  expect((await client.apple.operation(id, op)).result).toHaveProperty('remoteProfile')
  const p = (await client.apple.profiles(id))[0]!
  const assignment = operation()
  await client.apple.command(id, assignment, {
    kind: 'assign',
    profile,
    revision: p.revision,
    devices: ['SERIAL'],
  })
  domain.tick()
  expect((await client.apple.operation(id, assignment)).state).toBe('unknown')
  await client.apple.command(id, operation(), { kind: 'reconcile', operation: assignment })
  await client.apple.command(id, operation(), {
    kind: 'resolve',
    operation: op,
    remoteProfile: p.remoteUuid!,
  })
  await client.apple.command(id, operation(), { kind: 'clear', devices: ['SERIAL'] })
  await client.apple.command(id, operation(), { kind: 'sync', full: true })
  domain.tick()
  expect(() =>
    adeStatus({ ...(organizations[0]?.ade ?? {}), organizationId: id }, server),
  ).toThrow()
})
it('closes ADE status, result, Setup Assistant constraints and registration semantics', () => {
  const op = operation()
  const read = (result: unknown) =>
    adeOperation({ operationId: op, kind: 'sync', state: 'succeeded', result }, op)
  for (const result of [
    { reason: 'token_invalid' },
    { remoteProfile: op },
    { remoteProfile: op, recoveredBy: op },
    { reason: 'effect_confirmed', recoveredBy: op, registration: 'not_implied' },
    { pageDevices: 0, moreToFollow: false, registration: 'not_implied' },
    { devices: { SERIAL: 'SUCCESS' }, retryAfterSeconds: null, registration: 'not_implied' },
    { operationId: op, state: 'succeeded', revision: 1 },
  ])
    expect(read(result).result).not.toBeNull()
  for (const result of [
    { reason: 'new_unknown_code' },
    { registration: 'registered', pageDevices: 1, moreToFollow: false },
    { devices: { SERIAL: 'installed' }, retryAfterSeconds: null, registration: 'not_implied' },
    { secret: 'unexpected' },
  ])
    expect(() => read(result)).toThrow()
  for (const configuration of [
    { name: 'Corporate', mandatory: false, removable: false, skip: [] },
    { name: 'Corporate', mandatory: true, removable: false, skip: ['AppleID', 'AppleID'] },
    { name: 'Corporate', mandatory: true, removable: false, skip: ['Unsupported'] },
  ])
    expect(() => setup(configuration)).toThrow()
})
it('bounds plaintext Entra terms and forces a new version after text changes', async () => {
  const initial = await client.entra.policy(),
    p = {
      enabled: true,
      allUsers: true,
      users: [],
      termsVersion: 'v1',
      termsText: '<script>literal text</script>\n条款',
      allowBackground: false,
    }
  await client.entra.save(initial.revision, operation(), p)
  expect((await client.entra.policy()).policy.termsText).toBe(p.termsText)
  await expect(
    client.entra.save(1, operation(), { ...p, termsText: 'changed' }),
  ).rejects.toMatchObject({ status: 409 })
  await client.entra.save(1, operation(), { ...p, termsVersion: 'v2', termsText: 'changed' })
  expect(text('x'.repeat(32768), 32768, true)).toHaveLength(32768)
  for (const invalid of ['x'.repeat(32769), '界'.repeat(11000), 'control\u0000'])
    expect(() => text(invalid, 32768, true)).toThrow()
  for (const invalid of [
    { ...p, users: [ADMIN] },
    { ...p, allUsers: false, users: [] },
    { ...p, termsText: '' },
    { ...p, allUsers: false, users: [ADMIN, ADMIN] },
  ])
    expect(() => entraPolicy(invalid)).toThrow()
  const context = await client.entra.context()
  expect(context.canDecline).toBe(true)
  expect(termsContext({ ...context, mode: 'azureadjoin', canDecline: false }).canDecline).toBe(
    false,
  )
  for (const delta of [
    { mode: 'azureadjoin' },
    { csrfToken: 'invalid' },
    { opaqueBlob: 'secret' },
    { expiresAt: 0 },
  ])
    expect(() => termsContext({ ...context, ...delta })).toThrow()
})
