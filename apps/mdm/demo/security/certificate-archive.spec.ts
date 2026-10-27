import { expect, it } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createDeviceDemo } from '../devices/state'
import { createAutomationDemo } from '../policies/state'
import { createScenario, TENANT } from '../scenario'
import { createCertificateArchiveClient } from '../../src/features/security/certificate-archive/client'
import type {
  GenerateInput,
  ImportInput,
} from '../../src/features/security/certificate-archive/model'
import { INSTANCE, REVIEWER } from '../operations/authorization'
import { SYNTHETIC_ARCHIVE_MARKER } from './certificate-archive'

const uuid = () => crypto.randomUUID()
const secret = 'synthetic-only archive password'
const metadata = {
  name: 'MOCK archive text',
  category: 'custom',
  labels: ['synthetic'],
  usages: [],
  owner: '',
  notes: 'Synthetic fixture; no certificate, private key or encryption.',
}
async function fixture() {
  const devices = createDeviceDemo(),
    automation = createAutomationDemo(devices)
  const server = createScenario(
    [automation.handle, devices.handle],
    () => {
      devices.reset()
      automation.reset()
    },
    automation.tick,
    automation.observe,
    automation.now,
  )
  let headers: Record<string, string> = {}
  async function login(login = 'demo') {
    const response = await server.handle('POST', `/api/v1/identity/tenants/${TENANT}/login`, {
      login,
      password: 'demo',
    })
    headers = {
      'x-csrf-token': (response.body as { csrfToken: string }).csrfToken,
      'x-identity-request': '1',
    }
  }
  await login()
  const request = async <T>(options: RequestOptions<T>) => {
    const path = options.path.replace(/\{([^}]+)\}/g, (_, key: string) =>
        encodeURIComponent(options.pathParams?.[key] ?? ''),
      ),
      query = new URLSearchParams(
        Object.entries(options.query ?? {})
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => [key, String(value)]),
      )
    const response = await server.handle(options.method, path + '?' + query, options.body, {
      ...headers,
      ...Object.fromEntries(
        Object.entries(options.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]),
      ),
    })
    if (response.status !== options.successStatus)
      throw Object.assign(new Error('Synthetic archive HTTP failure'), {
        status: response.status,
        code: (response.body as { code?: string })?.code,
      })
    return options.decode(response.body)
  }
  const client = createCertificateArchiveClient({ request } as HttpTransport, TENANT)
  const generate = (entryId: string = uuid(), expectedRevision = 0): GenerateInput => ({
    entryId,
    expectedRevision,
    metadata: { ...metadata, vendor: { keep: true } },
    profile: 'ca',
    algorithm: 'p256',
    commonName: 'synthetic.example.test',
    organization: 'Mock fixture',
    sans: [],
    days: 30,
    issuer: null,
    scepUrl: null,
  })
  async function unlock() {
    await client.initialize(uuid(), secret)
    await client.unlock(secret)
  }
  return {
    client,
    server,
    generate,
    login,
    unlock,
    advance: (at: number) => automation.tick({ kind: 'clock', at }, 'normal'),
    raw: (method: string, path: string, body: unknown) =>
      server.handle(method, path, body, headers),
  }
}
it('serves strict empty reads and recovers exact initialization and settings operations after an unknown response', async () => {
  const f = await fixture(),
    operation = uuid()
  expect(await f.client.state()).toEqual({ initialized: false, generation: 0, unlockedUntil: null })
  expect(await f.client.list()).toMatchObject({
    tenantId: TENANT,
    items: [],
    nextCursor: null,
    alerts: { expired: 0, expiring: 0, notYetValid: 0 },
  })
  expect(await f.client.settings()).toMatchObject({ revision: 0, value: { reminderDays: 30 } })
  f.server.set('unknown')
  await expect(f.client.initialize(operation, secret)).rejects.toMatchObject({
    status: 503,
    code: 'operation_unknown',
  })
  f.server.set('normal')
  expect(await f.client.operation(operation)).toMatchObject({
    operationId: operation,
    action: 'certificate_archive_initialize',
    revision: 1,
  })
  expect(await f.client.initialize(operation, secret)).toMatchObject({ revision: 1 })
  await expect(f.client.initialize(operation, secret + 'changed')).rejects.toMatchObject({
    status: 409,
  })
  expect(await f.client.state()).toEqual({ initialized: true, generation: 1, unlockedUntil: null })
  const settingsOperation = uuid(),
    input = { reminderDays: 14, categories: ['custom', 'synthetic'] }
  expect(await f.client.saveSettings(settingsOperation, 0, input)).toMatchObject({ revision: 1 })
  expect(await f.client.saveSettings(settingsOperation, 0, input)).toMatchObject({ revision: 1 })
  await expect(f.client.saveSettings(uuid(), 0, input)).rejects.toMatchObject({ status: 409 })
  expect(await f.client.settings()).toEqual({ revision: 1, value: input })
})
it('keeps unlocks session-bound, expires them and invalidates every unlock after password generation changes', async () => {
  const f = await fixture()
  await f.unlock()
  const before = await f.client.state()
  expect(before.unlockedUntil).toBeGreaterThan(0)
  await f.login()
  expect((await f.client.state()).unlockedUntil).toBeNull()
  await expect(f.client.unlock('wrong synthetic password')).rejects.toMatchObject({
    status: 403,
    code: 'archive_password_rejected',
  })
  await f.client.unlock(secret)
  const original = uuid(),
    replacement = 'another synthetic-only password'
  await f.client.password(original, secret, replacement)
  expect(await f.client.state()).toEqual({ initialized: true, generation: 2, unlockedUntil: null })
  expect(await f.client.password(original, secret, replacement)).toMatchObject({ revision: 2 })
  await expect(f.client.unlock(secret)).rejects.toMatchObject({ status: 403 })
  await f.client.unlock(replacement)
  const until = (await f.client.state()).unlockedUntil!
  f.advance(until)
  expect((await f.client.state()).unlockedUntil).toBeNull()
  await expect(f.client.generate(uuid(), f.generate())).rejects.toMatchObject({ status: 423 })
  await f.client.unlock(replacement)
  await f.client.lock()
  expect((await f.client.state()).unlockedUntil).toBeNull()
  expect(until).toBeGreaterThan(0)
})
it('maintains material versions, metadata CAS, recommendations and synthetic-only export through the formal client', async () => {
  const f = await fixture()
  await f.unlock()
  const input = f.generate(),
    operation = uuid()
  expect(await f.client.generate(operation, input)).toMatchObject({
    entryId: input.entryId,
    version: 1,
    revision: 1,
  })
  const first = (await f.client.list()).items[0]!
  expect(first.latest.facts).toEqual([
    {
      name: 'MOCK-ca-NOT-A-CERTIFICATE.txt',
      format: 'opaque',
      certificates: [],
      publicKeys: [],
      containsPrivateKey: false,
    },
  ])
  await expect(f.client.saveMetadata(uuid(), input.entryId, 0, metadata)).rejects.toMatchObject({
    status: 409,
  })
  await f.client.saveMetadata(uuid(), input.entryId, 1, {
    ...input.metadata,
    name: 'Edited synthetic text',
  })
  const edited = (await f.client.list()).items[0]!
  expect(edited.latest.metadata).toMatchObject({
    name: 'Edited synthetic text',
    vendor: { keep: true },
  })
  await f.client.manage(uuid(), input.entryId, 2, true, 1)
  expect((await f.client.list()).items[0]).toMatchObject({
    revision: 3,
    retired: true,
    recommendedVersion: 1,
    latest: { version: 2 },
  })
  await f.client.generate(uuid(), f.generate(input.entryId, 3))
  const history = await f.client.history(input.entryId, { limit: 2 })
  expect(history.items.map((item) => item.version)).toEqual([4, 2])
  expect(history.nextCursor).toBeTruthy()
  expect(
    (await f.client.history(input.entryId, { limit: 2, cursor: history.nextCursor! })).items.map(
      (item) => item.version,
    ),
  ).toEqual([1])
  const files = await f.client.export(uuid(), { entryId: input.entryId, version: 4 })
  expect(files[0]!.name).toBe('MOCK-NOT-A-CERTIFICATE.txt')
  expect(Buffer.from(files[0]!.data, 'base64').toString()).toContain(SYNTHETIC_ARCHIVE_MARKER)
  await f.client.lock()
  await expect(
    f.client.export(uuid(), { entryId: input.entryId, version: 4 }),
  ).rejects.toMatchObject({ status: 423, code: 'archive_locked' })
})
it('accepts only explicit synthetic opaque imports and never exports submitted material or password bytes', async () => {
  const f = await fixture()
  await f.unlock()
  const input: ImportInput = {
    entryId: uuid(),
    expectedRevision: 0,
    metadata,
    requestVersion: null,
    files: [
      {
        name: 'synthetic.txt',
        format: 'opaque',
        data: Buffer.from(SYNTHETIC_ARCHIVE_MARKER + '\nDO-NOT-RETAIN-THIS-PAYLOAD').toString(
          'base64',
        ),
        password: null,
      },
    ],
  }
  await f.client.import(uuid(), input)
  const exported = await f.client.export(uuid(), { entryId: input.entryId, version: 1 })
  expect(Buffer.from(exported[0]!.data, 'base64').toString()).not.toContain('DO-NOT-RETAIN')
  for (const file of [
    { ...input.files[0]!, data: Buffer.from('real-looking uploaded secret').toString('base64') },
    { ...input.files[0]!, password: secret },
    { ...input.files[0]!, format: 'private_key' as const },
  ])
    await expect(
      f.client.import(uuid(), { ...input, entryId: uuid(), files: [file] }),
    ).rejects.toMatchObject({ status: 400, code: 'archive_material_invalid' })
  expect(JSON.stringify(await f.client.list())).not.toContain(secret)
})
it('uses tenant archive permissions and does not disclose another actor’s original operation', async () => {
  const f = await fixture(),
    operation = uuid()
  await f.client.initialize(operation, secret)
  expect(
    (
      await f.raw('PUT', '/api/v1/authorization/rules/' + uuid(), {
        operationId: uuid(),
        expectedRevision: 0,
        value: {
          subject: {
            kind: 'user',
            user: { instanceId: INSTANCE, tenantId: TENANT, principalId: REVIEWER },
          },
          grants: [{ operation: 'certificate_archive_read', scope: { kind: 'tenant' } }],
        },
      })
    ).status,
  ).toBe(200)
  await f.login('reviewer')
  expect(await f.client.state()).toMatchObject({ initialized: true, unlockedUntil: null })
  await expect(f.client.operation(operation)).rejects.toMatchObject({ status: 404 })
  await expect(f.client.initialize(uuid(), secret)).rejects.toMatchObject({ status: 403 })
  await f.login()
  expect(await f.client.operation(operation)).toMatchObject({ operationId: operation })
})
