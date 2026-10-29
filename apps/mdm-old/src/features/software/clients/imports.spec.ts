import { expect, it, vi } from 'vitest'
import type { HttpTransport, RequestOptions } from '@rss/api/mdm'
import { softwareResource } from '../../../../demo/software/fixtures'
import { createImportsClient, importRequest } from './imports'
it('sends a direct source-coordinate import and consumes only its current synchronous receipt', async () => {
  const { definition } = softwareResource(),
    input = {
      asOfUnixSeconds: 1,
      source: definition.source,
      resource: 'new',
      resourceVersion: '1',
      package: 'Example.App',
      packageVersion: '1.0',
      platform: 'windows',
      architecture: 'x86_64',
      variant: 'main',
      selection: {
        kind: 'winget',
        installerType: 'msi',
        scope: 'machine',
        installerId: null,
        files: ['manifest.json'],
      },
      behavior: definition.behavior,
      installerLength: 3,
      additionalArtifacts: {},
      dependencies: [],
      signatures: [],
      reboot: 'report',
      downgrade: 'deny',
      nativeExport: false,
    }
  const body = {
    operationId: '11111111-1111-4111-8111-111111111111',
    expectedRevision: 0,
    input: importRequest(input),
  }
  let reply: unknown = {
    resource: 'new',
    version: '1',
    resourceDigest: definition.artifacts.installer.sha256,
    storageRevision: 1,
  }
  const request = vi.fn(async (o: RequestOptions<unknown>) => o.decode(reply)),
    client = createImportsClient({ request } as unknown as HttpTransport)
  expect(await client.import(body)).toEqual(reply)
  expect(request.mock.calls[0]?.[0]).toMatchObject({
    method: 'POST',
    path: '/api/v1/software/imports',
    successStatus: 200,
    body,
  })
  expect(() => importRequest({ ...input, resolution: 'old' })).toThrow()
  expect(() =>
    importRequest({ ...input, selection: { ...input.selection, installer_type: 'msi' } }),
  ).toThrow()
  expect(() => importRequest({ ...input, installerLength: 0 })).toThrow()
  reply = { ...(reply as object), version: 'other' }
  await expect(client.import(body)).rejects.toThrow()
  request.mockRejectedValueOnce(new Error('lost'))
  await expect(client.import(body)).rejects.toThrow('lost')
  expect(request).toHaveBeenCalledTimes(3)
})
