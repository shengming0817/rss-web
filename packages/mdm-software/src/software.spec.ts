import { expect, it, vi } from 'vitest'
import {
  createSoftware,
  validateSource,
  type ImportInput,
  type SoftwarePort,
  type SourceDefinition,
  type SourceView,
} from './index'

const id = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222',
  hash = () => Array<number>(32).fill(7)
function definition(): SourceDefinition {
  return {
    id: 'company/source',
    revision: '1',
    protocol: {
      kind: 'winget_rest',
      location: 'https://source.example/rest/',
      identifier: 'company',
    },
  }
}
function source(): SourceView {
  return {
    source: definition(),
    snapshot: { id: 'company/source', revision: '1', sha256: hash() },
    lifecycle: {
      revision: 1,
      state: 'enabled',
      operation: id,
      actor: 'operator',
      at: 1800000000,
      digest: hash(),
    },
  }
}
function port(methods: Partial<SoftwarePort>): SoftwarePort {
  return new Proxy(methods as SoftwarePort, {
    get(target, key) {
      if (!(key in target)) throw new Error(`Unexpected software action: ${String(key)}`)
      return Reflect.get(target, key)
    },
  })
}
function input(): ImportInput {
  const invocation = {
    runAs: 'system' as const,
    arguments: ['/quiet', '/quiet'],
    environment: { MODE: '0' },
    timeoutSeconds: 60,
    outputBytes: 4096,
    exitCodes: { success: [0], reboot: [] },
  }
  return {
    asOfUnixSeconds: 1800000000,
    source: source().snapshot,
    resource: 'company/app',
    resourceVersion: 'resource-v2',
    package: 'Company.App',
    packageVersion: '1.2',
    platform: 'windows',
    architecture: 'x86_64',
    variant: 'main',
    selection: {
      kind: 'winget',
      installerType: 'msi',
      scope: 'machine',
      installerId: null,
      files: [],
    },
    behavior: {
      kind: 'msi',
      installer: 'installer',
      scope: 'system',
      install: invocation,
      upgradeInvocation: invocation,
      upgrade: 'in_place',
      uninstall: null,
      detect: {
        kind: 'msi_product',
        productCode: '{AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}',
        version: '1.2',
      },
    },
    installerLength: 3,
    additionalArtifacts: {
      helper: { reference: 'content/helper.dll', length: 1, sha256: hash(), origin: null },
    },
    dependencies: [
      {
        package: 'Company.Dependency',
        packageVersion: '1.0',
        resource: 'company/dependency',
        version: 'resource-v1',
        sha256: hash(),
      },
    ],
    signatures: [
      {
        artifact: 'installer',
        mechanism: 'authenticode',
        publisher: 'Company',
        evidence: { reference: 'evidence/signature', length: 1, sha256: hash(), origin: null },
      },
    ],
    reboot: 'report',
    downgrade: 'deny',
    nativeExport: false,
  }
}
it('accepts every current source protocol and rejects credentialed locations and moving Git references', () => {
  for (const protocol of [
    { kind: 'private' as const },
    definition().protocol,
    {
      kind: 'winget_community' as const,
      repository: 'https://git.example/manifests',
      commit: 'a'.repeat(40),
    },
    {
      kind: 'brew_tap' as const,
      repository: 'https://git.example/tap',
      commit: 'b'.repeat(40),
      tap: 'company/apps',
    },
  ])
    expect(() => validateSource({ ...definition(), protocol })).not.toThrow()
  for (const location of [
    'http://source.example',
    'https://user:password@source.example',
    'https://source.example/?token=private',
    'https://source.example/#private',
  ])
    expect(() =>
      validateSource({
        ...definition(),
        protocol: { kind: 'winget_rest', location, identifier: 'company' },
      }),
    ).toThrow()
  expect(() =>
    validateSource({
      ...definition(),
      protocol: {
        kind: 'brew_tap',
        repository: 'https://git.example/tap',
        commit: 'main',
        tap: 'company/apps',
      },
    }),
  ).toThrow('exact commit')
})
it('freezes the full original source registration before the caller edits its draft', async () => {
  const draft = {
      id: 'company/source',
      revision: '1',
      protocol: {
        kind: 'winget_rest' as const,
        location: 'https://source.example/rest/',
        identifier: 'company',
      },
    },
    change = {
      operationId: id,
      expectedRevision: 0,
      input: { action: 'register' as const, definition: draft },
    },
    write = vi.fn<SoftwarePort['changeSource']>().mockResolvedValue(source()),
    software = createSoftware(port({ changeSource: write })),
    running = software.changeSource(draft.id, draft.revision, change)
  draft.protocol.location = 'https://changed.example/'
  await running
  expect(write).toHaveBeenCalledTimes(1)
  expect(write.mock.calls[0]?.[2].input).toMatchObject({
    definition: { protocol: { location: 'https://source.example/rest/' } },
  })
  expect(Object.isFrozen(write.mock.calls[0]?.[2].input)).toBe(true)
})
it('keeps source lifecycle CAS separate from source revision and rejects mismatched original receipts', async () => {
  const write = vi.fn<SoftwarePort['changeSource']>().mockResolvedValue({
      ...source(),
      lifecycle: { ...source().lifecycle, revision: 5, state: 'disabled' },
    }),
    software = createSoftware(port({ changeSource: write })),
    original = { operationId: id, expectedRevision: 4, input: { action: 'disable' as const } }
  expect((await software.changeSource('company/source', '1', original)).lifecycle.state).toBe(
    'disabled',
  )
  expect(write.mock.calls[0]?.slice(0, 2)).toEqual(['company/source', '1'])
  write.mockResolvedValueOnce({
    ...source(),
    lifecycle: { ...source().lifecycle, revision: 5, operation: other, state: 'disabled' },
  })
  await expect(software.changeSource('company/source', '1', original)).rejects.toThrow(
    'operation receipt',
  )
  write.mockResolvedValueOnce({
    ...source(),
    lifecycle: { ...source().lifecycle, revision: 5, state: 'enabled' },
  })
  await expect(software.changeSource('company/source', '1', original)).rejects.toThrow(
    'source change receipt',
  )
})
it('does not replay an unknown import and preserves exact version, ordered arguments, evidence and Direct export choice', async () => {
  const write = vi
      .fn<SoftwarePort['import']>()
      .mockRejectedValueOnce({ status: 503, code: 'operation_unknown' })
      .mockResolvedValueOnce({
        resource: 'company/app',
        version: 'resource-v2',
        resourceDigest: hash(),
        storageRevision: 8,
      }),
    software = createSoftware(port({ import: write })),
    original = { operationId: id, expectedRevision: 7, input: input() }
  await expect(software.import(original)).rejects.toMatchObject({ code: 'operation_unknown' })
  expect(write).toHaveBeenCalledTimes(1)
  expect(write.mock.calls[0]?.[0].input.behavior).toMatchObject({
    install: { arguments: ['/quiet', '/quiet'], environment: { MODE: '0' } },
  })
  expect(write.mock.calls[0]?.[0].input.signatures[0]?.evidence?.reference).toBe(
    'evidence/signature',
  )
  expect(write.mock.calls[0]?.[0].input.nativeExport).toBe(false)
  await software.import(original)
  expect(write.mock.calls[1]?.[0]).toEqual(write.mock.calls[0]?.[0])
})
it('distinguishes not-admitted null from read failure and binds admission writes to their own revision and original operation', async () => {
  const view = {
      resource: 'company/app',
      version: 'resource-v2',
      resourceDigest: hash(),
      resourceRevision: 21,
      presentation: { name: 'App', unknown: { enabled: false, count: 0 } },
      lifecycle: null,
    },
    read = vi
      .fn<SoftwarePort['version']>()
      .mockResolvedValueOnce(view)
      .mockRejectedValueOnce({ status: 403, code: 'insufficient_privilege' }),
    write = vi
      .fn<SoftwarePort['changeVersion']>()
      .mockResolvedValueOnce({
        resource: view.resource,
        version: view.version,
        lifecycle: { ...source().lifecycle, revision: 1 },
      })
      .mockResolvedValueOnce({
        resource: view.resource,
        version: view.version,
        lifecycle: { ...source().lifecycle, revision: 2, state: 'withdrawn', operation: other },
      }),
    software = createSoftware(port({ version: read, changeVersion: write }))
  expect((await software.version(view.resource, view.version)).lifecycle).toBeNull()
  await expect(software.version(view.resource, view.version)).rejects.toMatchObject({ status: 403 })
  await software.changeVersion(view.resource, view.version, {
    operationId: id,
    expectedRevision: 0,
    input: { action: 'enable' },
  })
  expect(write.mock.calls[0]?.[2].expectedRevision).toBe(0)
  await software.changeVersion(view.resource, view.version, {
    operationId: other,
    expectedRevision: 1,
    input: { action: 'withdraw' },
  })
  expect(write.mock.calls[1]?.[2].expectedRevision).toBe(1)
})
it('rejects unknown source and admission actions before reaching a port', async () => {
  const software = createSoftware(port({}))
  await expect(
    software.changeSource('source', '1', {
      operationId: id,
      expectedRevision: 0,
      input: { action: 'remove' } as never,
    }),
  ).rejects.toThrow('source action')
  await expect(
    software.changeVersion('resource', 'v1', {
      operationId: id,
      expectedRevision: 0,
      input: { action: 'publish' } as never,
    }),
  ).rejects.toThrow('admission action')
})
