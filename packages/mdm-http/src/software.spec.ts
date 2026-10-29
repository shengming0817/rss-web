import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { createSoftware } from '@rss/mdm-software'
import { createSoftwareAdapter } from './software'

const id = '11111111-1111-4111-8111-111111111111',
  hash = () => Array<number>(32).fill(5)
function fixture(read: (options: RequestOptions<unknown>) => unknown | Promise<unknown>) {
  const request = vi.fn(async (options: RequestOptions<unknown>) =>
      options.decode(await read(options)),
    ),
    adapter = createSoftwareAdapter({ request } as unknown as HttpTransport)
  return { request, adapter, software: createSoftware(adapter) }
}
function source() {
  return {
    source: {
      id: 'company/tap',
      revision: '1',
      protocol: {
        kind: 'brew_tap' as const,
        repository: 'https://git.example/company/tap',
        tap: 'company/apps',
        commit: 'a'.repeat(40),
      },
    },
    snapshot: { id: 'company/tap', revision: '1', sha256: hash() },
    lifecycle: {
      revision: 1,
      state: 'enabled' as const,
      operation: id,
      actor: 'operator',
      at: 1800000000,
      digest: hash(),
    },
  }
}
it('keeps both Source identity coordinates in a projected directory without fetching every source detail', async () => {
  const f = fixture(() => ({
    items: [{ id: 'company/tap', revision: '1', protocol: 'brew_tap' }],
    nextCursor: 'b3BhcXVl',
  }))
  expect(await f.software.sources({ fields: ['protocol'], limit: 1 })).toEqual({
    items: [{ id: 'company/tap', revision: '1', protocol: 'brew_tap' }],
    nextCursor: 'b3BhcXVl',
  })
  expect(f.request).toHaveBeenCalledTimes(1)
  expect(f.request.mock.calls[0]?.[0]).toMatchObject({
    method: 'GET',
    path: '/api/v1/software/sources',
    query: { fields: 'id,revision,protocol', limit: 1 },
  })
})
it('registers a pinned Brew source through the generated body and binds its exact definition/snapshot/lifecycle', async () => {
  const value = source(),
    f = fixture(() => value),
    change = {
      operationId: id,
      expectedRevision: 0,
      input: { action: 'register' as const, definition: value.source },
    }
  expect(await f.software.changeSource('company/tap', '1', change)).toEqual(value)
  expect(f.request.mock.calls[0]?.[0]).toMatchObject({
    method: 'POST',
    path: '/api/v1/software/sources/{id}/revisions/{revision}',
    pathParams: { id: 'company/tap', revision: '1' },
    body: change,
  })
  const wrong = fixture(() => ({ ...value, snapshot: { ...value.snapshot, revision: '2' } }))
  await expect(wrong.software.source('company/tap', '1')).rejects.toThrow('Wrong source revision')
})
it('reads Resource version states without confusing them with admission or requiring a redundant projected resource key', async () => {
  const f = fixture(() => ({
    items: [{ version: 'resource-v2', state: 'active' }],
    nextCursor: null,
  }))
  expect(
    (await f.software.versions('company/app', { fields: ['version', 'state'] })).items,
  ).toEqual([{ version: 'resource-v2', state: 'active' }])
  expect(f.request.mock.calls[0]?.[0].pathParams).toEqual({ id: 'company/app' })
  const wrong = fixture(() => ({
    items: [{ version: 'resource-v2', resource: 'another', state: 'active' }],
    nextCursor: null,
  }))
  await expect(wrong.software.versions('company/app')).rejects.toThrow(
    'Wrong resource version directory',
  )
  const confused = fixture(() => ({
    items: [{ version: 'resource-v2', state: 'enabled' }],
    nextCursor: null,
  }))
  await expect(
    confused.software.versions('company/app', { fields: ['version', 'state'] }),
  ).rejects.toThrow()
})
it('preserves unknown presentation keys and represents no admission separately from source/resource revision', async () => {
  const value = {
      resource: 'company/app',
      version: 'resource-v2',
      resourceDigest: hash(),
      resourceRevision: 18,
      presentation: { name: 'App', custom: { flag: false, count: 0 } },
      lifecycle: null,
    },
    f = fixture(() => value)
  expect(await f.software.version('company/app', 'resource-v2')).toEqual(value)
  const denied = fixture(() => {
    throw { status: 403, code: 'insufficient_privilege' }
  })
  await expect(denied.software.version('company/app', 'resource-v2')).rejects.toMatchObject({
    status: 403,
  })
})
it('withdraws by the admission lifecycle revision and preserves a definitive CAS error without replay', async () => {
  const value = source(),
    change = { operationId: id, expectedRevision: 3, input: { action: 'withdraw' as const } },
    f = fixture(() => ({
      resource: 'company/app',
      version: 'resource-v2',
      lifecycle: { ...value.lifecycle, state: 'withdrawn', revision: 4 },
    }))
  await f.software.changeVersion('company/app', 'resource-v2', change)
  expect(f.request.mock.calls[0]?.[0]).toMatchObject({
    method: 'POST',
    path: '/api/v1/software/resources/{id}/versions/{version}',
    pathParams: { id: 'company/app', version: 'resource-v2' },
    body: change,
  })
  const conflict = fixture(() => {
    throw { status: 409, code: 'configuration_changed' }
  })
  await expect(
    conflict.software.changeVersion('company/app', 'resource-v2', change),
  ).rejects.toMatchObject({ status: 409 })
  expect(conflict.request).toHaveBeenCalledTimes(1)
})

it('sends a complete pinned Brew import with ordered invocation arguments and Direct choice through the formal import operation', async () => {
  const invocation = {
      runAs: 'system' as const,
      arguments: ['--quiet', '--quiet'],
      environment: { FLAG: '0' },
      timeoutSeconds: 60,
      outputBytes: 4096,
      exitCodes: { success: [0], reboot: [] },
    },
    change = {
      operationId: id,
      expectedRevision: 8,
      input: {
        asOfUnixSeconds: 1800000000,
        source: source().snapshot,
        resource: 'company/app',
        resourceVersion: 'resource-v2',
        package: 'company-app',
        packageVersion: '1.2',
        platform: 'macos' as const,
        architecture: 'aarch64' as const,
        variant: 'main',
        selection: {
          kind: 'brew' as const,
          path: 'Casks/company-app.rb',
          bottleTag: 'arm64_sonoma',
          sourceLength: null,
        },
        behavior: {
          kind: 'pkg' as const,
          installer: 'installer',
          scope: 'system' as const,
          install: invocation,
          upgradeInvocation: invocation,
          upgrade: 'in_place' as const,
          uninstall: null,
          detect: { kind: 'pkg_receipt' as const, receipt: 'com.company.app', version: '1.2' },
        },
        installerLength: 3,
        additionalArtifacts: {},
        dependencies: [],
        signatures: [],
        reboot: 'report' as const,
        downgrade: 'deny' as const,
        nativeExport: false,
      },
    },
    f = fixture(() => ({
      resource: 'company/app',
      version: 'resource-v2',
      resourceDigest: hash(),
      storageRevision: 9,
    }))
  await f.software.import(change)
  expect(f.request.mock.calls[0]?.[0]).toMatchObject({
    method: 'POST',
    path: '/api/v1/software/imports',
    successStatus: 200,
    body: change,
  })
  expect(f.request).toHaveBeenCalledTimes(1)
})
