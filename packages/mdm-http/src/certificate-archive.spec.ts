import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createCertificateArchive } from '@rss/mdm-certificates/archive'
import { createCertificateArchiveAdapter } from './certificate-archive'
const tenant = '11111111-1111-4111-8111-111111111111',
  entryId = '22222222-2222-4222-8222-222222222222',
  operationId = '33333333-3333-4333-8333-333333333333'
const metadata = () => ({
  name: 'CA',
  category: 'mdm-ca',
  owner: '',
  notes: '',
  labels: [],
  usages: [],
  vendor: { nested: { retained: false } },
})
const version = () => ({
  entryId,
  version: 3,
  actor: 'api-key:operator',
  instance: tenant,
  operationId,
  createdAt: 1700000000,
  metadata: metadata(),
  facts: [],
  requestVersion: null,
  source: 'generate',
})
const entry = () => ({
  id: entryId,
  revision: 5,
  retired: false,
  recommendedVersion: 3,
  latest: version(),
})
const receipt = (
  action: string,
  id: string | null = null,
  version: number | null = null,
  revision = 1,
) => ({ operationId, action: 'certificate_archive_' + action, entryId: id, version, revision })
function fixture(value: unknown) {
  const request = vi.fn(async (options: RequestOptions<unknown>) => options.decode(value)),
    adapter = createCertificateArchiveAdapter({ request } as unknown as HttpTransport, tenant)
  return { request, adapter, core: createCertificateArchive(adapter, tenant) }
}
it('admits the archive directory projection, preserving metadata and non-UUID actor identities', async () => {
  const f = fixture({
    tenantId: tenant,
    items: [entry()],
    nextCursor: null,
    asOf: 1700000001,
    reminderDays: 30,
    alerts: { expired: 0, expiring: 1, notYetValid: 0 },
  })
  const result = await f.core.list()
  expect(result.items[0]!.latest!.actor).toBe('api-key:operator')
  expect(result.items[0]!.latest!.metadata['vendor']).toEqual({ nested: { retained: false } })
  const projected = fixture({
    tenantId: tenant,
    items: [{ id: entryId, revision: 5 }],
    nextCursor: null,
    asOf: 1700000001,
    reminderDays: 30,
    alerts: { expired: 0, expiring: 0, notYetValid: 0 },
  })
  expect((await projected.core.list({ fields: ['id', 'revision'] })).items).toEqual([
    { id: entryId, revision: 5 },
  ])
  const other = fixture({ ...result, tenantId: entryId })
  await expect(other.core.list()).rejects.toBeDefined()
})
it('uses independent detail and exact version history without equating revision with version', async () => {
  expect(await fixture(entry()).core.entry(entryId)).toEqual(entry())
  const f = fixture({ items: [version()], nextCursor: null })
  expect((await f.core.history(entryId)).items[0]!.version).toBe(3)
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({ pathParams: { entry: entryId }, query: { limit: 50 } }),
  )
  await expect(fixture({ ...entry(), id: tenant }).core.entry(entryId)).rejects.toBeDefined()
})
it('projects import files into the exact formal body and never forwards the operation envelope', async () => {
  const f = fixture(receipt('import', entryId, 6, 6))
  await f.core.import(
    {
      operationId,
      entryId,
      expectedRevision: 5,
      metadata: metadata(),
      files: [{ name: 'key.pem', format: 'private_key' }],
      requestVersion: { entryId, version: 3 },
    },
    [
      {
        name: 'key.pem',
        bytes: new Uint8Array([1, 2, 3]).buffer,
        password: 'synthetic-file-password',
      },
    ],
  )
  expect(f.request).toHaveBeenCalledWith(
    expect.objectContaining({
      headers: expect.objectContaining({ 'Idempotency-Key': operationId }),
      body: {
        entryId,
        expectedRevision: 5,
        metadata: metadata(),
        requestVersion: { entryId, version: 3 },
        files: [
          {
            name: 'key.pem',
            format: 'private_key',
            data: 'AQID',
            password: 'synthetic-file-password',
          },
        ],
      },
    }),
  )
  expect(f.request.mock.calls[0]![0].body).not.toHaveProperty('operationId')
})
it('supports all generation profile fields, metadata CAS, lifecycle CAS and settings CAS', async () => {
  const gen = fixture(receipt('generate', entryId, 6, 6))
  await gen.core.generate({
    operationId,
    entryId,
    expectedRevision: 5,
    metadata: metadata(),
    profile: 'https',
    algorithm: 'rsa3072',
    commonName: 'host.example.test',
    organization: 'Ops',
    sans: ['host.example.test'],
    days: 90,
    issuer: { entryId, version: 3 },
    scepUrl: null,
  })
  expect(gen.request.mock.calls[0]![0].body).toMatchObject({
    profile: 'https',
    algorithm: 'rsa3072',
    issuer: { entryId, version: 3 },
  })
  const meta = fixture(receipt('metadata', entryId, 6, 6))
  await meta.core.metadata({ operationId, entryId, expectedRevision: 5, metadata: metadata() })
  expect(meta.request.mock.calls[0]![0]).toMatchObject({
    method: 'PUT',
    path: '/api/v1/certificate-archive/entries/{entry}/metadata',
    body: { expectedRevision: 5, metadata: metadata() },
  })
  await fixture(receipt('manage', entryId, null, 6)).core.manage({
    operationId,
    entryId,
    expectedRevision: 5,
    retired: true,
    recommendedVersion: null,
  })
  await fixture(receipt('settings', null, null, 2)).core.saveSettings({
    operationId,
    expectedRevision: 1,
    value: { reminderDays: 7, categories: ['custom'] },
  })
  expect(
    await fixture({
      revision: 1,
      value: { reminderDays: 30, categories: ['custom'] },
    }).core.settings(),
  ).toMatchObject({ revision: 1 })
})
it('requires exact archive receipt action and does not confuse an export receipt with bytes', async () => {
  const f = fixture(receipt('export', entryId, 3, 3))
  expect(
    await f.core.operation({
      operationId,
      action: 'export',
      entryId,
      version: 3,
      expectedRevision: null,
    }),
  ).toMatchObject({ action: 'export' })
  await expect(
    f.core.operation({ operationId, action: 'import', entryId, version: 3, expectedRevision: 2 }),
  ).rejects.toThrow('receipt')
  expect(f.request.mock.calls.every((call) => call[0].method === 'GET')).toBe(true)
})
it('decodes private export buffers only for the requested exact version and forwards cancellation', async () => {
  const f = fixture({ entryId, version: 3, files: [{ name: 'key.pk8', data: 'AQID' }] }),
    controller = new AbortController()
  const files = await f.core.export({ operationId, entryId, version: 3 }, controller.signal)
  expect([...new Uint8Array(files[0]!.bytes)]).toEqual([1, 2, 3])
  expect(f.request.mock.calls[0]![0].signal).toBe(controller.signal)
  new Uint8Array(files[0]!.bytes).fill(0)
  for (const value of [
    { entryId, version: 4, files: [{ name: 'key', data: 'AQID' }] },
    { entryId, version: 3, files: [{ name: '../key', data: 'AQID' }] },
    { entryId, version: 3, files: [{ name: 'key', data: 'YR==' }] },
  ])
    await expect(
      fixture(value).core.export({ operationId, entryId, version: 3 }),
    ).rejects.toBeDefined()
})
it('keeps initialize, unlock, lock and password change as distinct formal operations', async () => {
  const initialize = fixture(receipt('initialize'))
  await initialize.core.initialize(operationId, 'synthetic-master-password')
  expect(initialize.request.mock.calls[0]![0]).toMatchObject({
    path: '/api/v1/certificate-archive/vault/initialize',
    body: { password: 'synthetic-master-password' },
  })
  const unlock = fixture({ initialized: true, generation: 1, unlockedUntil: 1800000000 })
  await unlock.core.unlock('synthetic-master-password')
  expect(unlock.request.mock.calls[0]![0].headers).not.toHaveProperty('Idempotency-Key')
  await fixture({ locked: true }).core.lock()
  await fixture(receipt('password_change', null, null, 2)).core.changePassword(
    operationId,
    'old',
    'synthetic-new-password',
  )
})
