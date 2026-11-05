import { describe, expect, it, vi } from 'vitest'
import {
  createCertificateArchive,
  validateGeneration,
  validateMetadata,
  validity,
  type ArchivePort,
  type Entry,
  type GenerateIntent,
  type Metadata,
  type OriginalOperation,
  type Receipt,
  type Version,
} from './index'
const tenant = '11111111-1111-4111-8111-111111111111',
  entryId = '22222222-2222-4222-8222-222222222222',
  operationId = '33333333-3333-4333-8333-333333333333'
const metadata = (): Metadata => ({
  name: 'Operations CA',
  category: 'mdm-ca',
  owner: '',
  notes: '',
  labels: [],
  usages: [],
  vendor: { nested: { retained: true } },
})
const version = (): Version => ({
  entryId,
  version: 3,
  actor: 'api-key:archive-operator',
  instance: tenant,
  operationId,
  createdAt: 1700000000,
  metadata: metadata(),
  facts: [],
  requestVersion: null,
  source: 'generate',
})
const entry = (): Entry => ({
  id: entryId,
  revision: 5,
  retired: false,
  recommendedVersion: 3,
  latest: version(),
})
const generate = (): GenerateIntent => ({
  operationId,
  entryId,
  expectedRevision: 5,
  metadata: metadata(),
  profile: 'ca',
  algorithm: 'p256',
  commonName: 'Tenant CA',
  organization: '',
  sans: [],
  days: 0,
  issuer: null,
  scepUrl: null,
})
function receipt(
  action: Receipt['action'],
  entry: string | null = null,
  version: number | null = null,
  revision = 1,
): Receipt {
  return { operationId, action, entryId: entry, version, revision }
}
function fixture(overrides: Partial<ArchivePort> = {}) {
  const port: ArchivePort = {
    vault: vi.fn(async () => ({ initialized: true, generation: 1, unlockedUntil: 1800000000 })),
    initialize: vi.fn(async () => receipt('initialize')),
    unlock: vi.fn(async () => ({ initialized: true, generation: 1, unlockedUntil: 1800000000 })),
    lock: vi.fn(async () => {}),
    changePassword: vi.fn(async () => receipt('password_change', null, null, 2)),
    list: vi.fn(async () => ({
      tenantId: tenant,
      items: [entry()],
      nextCursor: null,
      asOf: 1700000001,
      reminderDays: 30,
      alerts: { expired: 0, expiring: 0, notYetValid: 0 },
    })),
    entry: vi.fn(async () => entry()),
    history: vi.fn(async () => ({ items: [version()], nextCursor: null })),
    import: vi.fn(async (input) =>
      receipt('import', input.entryId, input.expectedRevision + 1, input.expectedRevision + 1),
    ),
    generate: vi.fn(async (input) =>
      receipt('generate', input.entryId, input.expectedRevision + 1, input.expectedRevision + 1),
    ),
    metadata: vi.fn(async (input) =>
      receipt('metadata', input.entryId, input.expectedRevision + 1, input.expectedRevision + 1),
    ),
    manage: vi.fn(async (input) =>
      receipt('manage', input.entryId, null, input.expectedRevision + 1),
    ),
    export: vi.fn(async () => [{ name: 'ca.pem', bytes: new Uint8Array([1, 2, 3]).buffer }]),
    operation: vi.fn(async () => receipt('export', entryId, 3, 3)),
    settings: vi.fn(async () => ({
      revision: 0,
      value: { reminderDays: 30, categories: ['mdm-ca'] },
    })),
    saveSettings: vi.fn(async (input) =>
      receipt('settings', null, null, input.expectedRevision + 1),
    ),
    ...overrides,
  }
  return { port, core: createCertificateArchive(port, tenant) }
}
describe('Certificate archive', () => {
  it('uses entry revision for writes while history and recommendation retain exact material versions', async () => {
    const { core, port } = fixture(),
      detail = await core.entry(entryId)
    expect(detail.latest.version).toBe(3)
    await core.manage({
      operationId,
      entryId,
      expectedRevision: detail.revision,
      retired: false,
      recommendedVersion: detail.latest.version,
    })
    expect(port.manage).toHaveBeenCalledWith({
      operationId,
      entryId,
      expectedRevision: 5,
      retired: false,
      recommendedVersion: 3,
    })
    expect((await core.history(entryId)).items[0]!.actor).toBe('api-key:archive-operator')
    expect((await core.generate(generate())).version).toBe(6)
  })
  it('retains full nested metadata without an implicit merge', async () => {
    const { core, port } = fixture(),
      data = metadata()
    await core.metadata({
      operationId,
      entryId,
      expectedRevision: 5,
      metadata: { ...data, name: 'Renamed' },
    })
    const saved = vi.mocked(port.metadata).mock.calls[0]![0].metadata
    expect(saved['vendor']).toEqual({ nested: { retained: true } })
    expect(Object.isFrozen(saved['vendor'])).toBe(true)
    expect(Reflect.set(data, 'vendor', 'changed after submission')).toBe(true)
    expect(saved['vendor']).toEqual({ nested: { retained: true } })
  })
  it('applies UTF8, structural and full metadata budgets', () => {
    expect(() => validateMetadata({ ...metadata(), name: '中'.repeat(86) })).toThrow('text')
    expect(() => validateMetadata({ ...metadata(), vendor: 'a'.repeat(16384) })).toThrow('budget')
    expect(() => validateMetadata({ ...metadata(), vendor: { constructor: 'unsafe' } })).toThrow(
      'key',
    )
    expect(() => validateMetadata({ ...metadata(), usages: [''] })).toThrow('Empty')
    expect(() => validateMetadata({ ...metadata(), owner: null } as unknown as Metadata)).toThrow(
      'text',
    )
  })
  it.each(['ca', 'csr', 'apns_csr', 'scep_template', 'https'] as const)(
    'supports formal generation profile %s',
    (profile) => {
      const input = {
        ...generate(),
        profile,
        algorithm: profile === 'apns_csr' ? ('rsa2048' as const) : ('p256' as const),
        sans: profile === 'https' ? ['mdm.example.test'] : [],
        issuer: profile === 'https' ? { entryId, version: 3 } : null,
        scepUrl: profile === 'scep_template' ? 'https://mdm.example.test/scep' : null,
      }
      expect(() => validateGeneration(input)).not.toThrow()
    },
  )
  it.each(['rsa2048', 'rsa3072', 'p256'] as const)('supports formal algorithm %s', (algorithm) => {
    expect(() => validateGeneration({ ...generate(), algorithm })).not.toThrow()
  })
  it('rejects incomplete authoring before generation', async () => {
    const { core, port } = fixture()
    for (const input of [
      { ...generate(), profile: 'https' as const },
      { ...generate(), profile: 'apns_csr' as const },
      {
        ...generate(),
        profile: 'scep_template' as const,
        scepUrl: 'https://user:password@mdm.example.test/scep',
      },
      { ...generate(), issuer: { entryId, version: 3 } },
    ])
      await expect(core.generate(input)).rejects.toThrow()
    expect(port.generate).not.toHaveBeenCalled()
  })
  it('keeps imported private buffers/passwords out of the frozen original intent', async () => {
    const { core, port } = fixture(),
      bytes = new Uint8Array([1, 2, 3]).buffer,
      password = 'synthetic-file-password'
    const input = {
      operationId,
      entryId,
      expectedRevision: 5,
      metadata: metadata(),
      files: [
        { name: 'key.pem', format: 'private_key' as const, data: 'should not survive', password },
      ],
      requestVersion: null,
    }
    await core.import(input, [{ name: 'key.pem', bytes, password }])
    const [intent, materials] = vi.mocked(port.import).mock.calls[0]!
    expect(intent.files).toEqual([{ name: 'key.pem', format: 'private_key' }])
    expect(JSON.stringify(intent)).not.toContain(password)
    expect(materials[0]!.bytes).toBe(bytes)
    expect(materials[0]!.password).toBe(password)
  })
  it.each(['certificate', 'chain', 'csr', 'pkcs12', 'private_key', 'opaque'] as const)(
    'admits complete import descriptor for %s',
    async (format) => {
      const { core } = fixture()
      await expect(
        core.import(
          {
            operationId,
            entryId,
            expectedRevision: 0,
            metadata: metadata(),
            files: [{ name: 'material', format }],
            requestVersion: null,
          },
          [{ name: 'material', bytes: new Uint8Array([1]).buffer, password: null }],
        ),
      ).resolves.toMatchObject({ version: 1 })
    },
  )
  it('rejects wrong files, traversal and material budgets without an HTTP call', async () => {
    const { core, port } = fixture(),
      input = {
        operationId,
        entryId,
        expectedRevision: 0,
        metadata: metadata(),
        files: [{ name: 'key', format: 'private_key' as const }],
        requestVersion: null,
      }
    await expect(
      core.import(input, [{ name: 'other', bytes: new ArrayBuffer(1), password: null }]),
    ).rejects.toThrow('file')
    await expect(
      core.import({ ...input, files: [{ name: '../key', format: 'opaque' }] }, [
        { name: '../key', bytes: new ArrayBuffer(1), password: null },
      ]),
    ).rejects.toThrow('filename')
    await expect(
      core.import(input, [
        { name: 'key', bytes: new ArrayBuffer(1024 * 1024 + 1), password: null },
      ]),
    ).rejects.toThrow('MiB')
    expect(port.import).not.toHaveBeenCalled()
  })
  it('binds recovered receipts to the original action, entry, version and revision', async () => {
    const original: OriginalOperation = {
      operationId,
      action: 'generate',
      entryId,
      version: 6,
      expectedRevision: 5,
    }
    for (const bad of [
      receipt('import', entryId, 6, 6),
      receipt('generate', tenant, 6, 6),
      receipt('generate', entryId, 5, 6),
      receipt('generate', entryId, 6, 7),
    ]) {
      const { core } = fixture({ operation: vi.fn(async () => bad) })
      await expect(core.operation(original)).rejects.toThrow('receipt')
    }
    const { core } = fixture({ operation: vi.fn(async () => receipt('generate', entryId, 6, 6)) })
    expect(await core.operation(original)).toMatchObject({ action: 'generate', version: 6 })
  })
  it('keeps Unknown as an error without retrying, changing key or inventing delivery from a receipt', async () => {
    const unknown = new Error('operation_unknown'),
      { core, port } = fixture({
        generate: vi.fn(async () => {
          throw unknown
        }),
      })
    await expect(core.generate(generate())).rejects.toBe(unknown)
    expect(port.generate).toHaveBeenCalledTimes(1)
    expect(port.operation).not.toHaveBeenCalled()
    const result = await core.operation({
      operationId,
      action: 'export',
      entryId,
      version: 3,
      expectedRevision: null,
    })
    expect(result).not.toHaveProperty('files')
    expect(port.export).not.toHaveBeenCalled()
  })
  it('zeros late export bytes after cancellation and rejects unsafe filenames without retaining bytes', async () => {
    for (const name of ['private.key', '../private.key', 'private\0.key']) {
      const controller = new AbortController(),
        bytes = new Uint8Array([1, 2, 3]),
        { core } = fixture({
          export: vi.fn(async () => {
            if (name === 'private.key') controller.abort()
            return [{ name, bytes: bytes.buffer }]
          }),
        })
      await expect(
        core.export({ operationId, entryId, version: 3 }, controller.signal),
      ).rejects.toThrow()
      expect([...bytes]).toEqual([0, 0, 0])
    }
  })
  it('keeps vault unlock separate from initialization and export authority', async () => {
    const { core, port } = fixture()
    await core.initialize(operationId, 'synthetic-master-password')
    expect(port.unlock).not.toHaveBeenCalled()
    expect(port.export).not.toHaveBeenCalled()
    await expect(core.unlock('wrong')).resolves.toMatchObject({ initialized: true })
    expect(port.unlock).toHaveBeenCalledWith('wrong')
    await core.changePassword(operationId, 'old', 'new-synthetic-password')
    expect(port.changePassword).toHaveBeenCalledWith(operationId, 'old', 'new-synthetic-password')
  })
  it('describes certificate validity as material facts rather than device deployment', () => {
    expect(validity([{ format: 'csr', certificates: [] }], 100, 30)).toBe('request')
    expect(validity([{ format: 'opaque', certificates: [] }], 100, 30)).toBe('unparsed')
    expect(
      validity(
        [{ format: 'certificate', certificates: [{ notBefore: 1, notAfter: 99 }] }],
        100,
        30,
      ),
    ).toBe('expired')
    expect(
      validity(
        [{ format: 'certificate', certificates: [{ notBefore: 101, notAfter: 999 }] }],
        100,
        30,
      ),
    ).toBe('not_yet_valid')
  })
})
