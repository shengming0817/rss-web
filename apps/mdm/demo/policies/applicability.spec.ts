import { expect, it } from 'vitest'
import { makeDevices } from '../devices/fixtures'
import { resourceApplicability } from './applicability'
import type { ResourceRead } from '../../src/features/policies/clients/resources'
it('requires the exact active Agent resource variant for the current device', () => {
  const devices = makeDevices(),
    windows = devices.get('device-01')!,
    mac = devices.get('device-02')!
  const resource: ResourceRead = {
    origin: null,
    presentation: {},
    id: 'package',
    revision: 1,
    kind: 'software',
    versions: [
      {
        id: '1',
        state: 'active',

        digest: Array(32).fill(1),
        variants: [
          {
            key: 'main',
            platform: 'windows',
            architecture: 'x86_64',
            declaration: {
              kind: 'software',
              definition: {
                source: { id: 'private', revision: '1', sha256: Array(32).fill(1) },
                package: 'pkg',
                version: '1',
                artifacts: {
                  installer: {
                    reference: 'pkg',
                    origin: null,
                    length: 1,
                    sha256: Array(32).fill(2),
                  },
                },
                reboot: 'report',
                downgrade: 'deny',
                dependencies: [],
                provenance: { kind: 'private' },
                signatures: [],
                export: { kind: 'disabled' },
                material: { bundle_id: null, format: 'msi', installer: 'installer' },
                behavior: {
                  kind: 'msi',
                  installer: 'installer',
                  scope: 'system',
                  install: {
                    runAs: 'system',
                    arguments: [],
                    environment: {},
                    timeoutSeconds: 60,
                    outputBytes: 1024,
                    exitCodes: { success: [0], reboot: [3010] },
                  },
                  upgradeInvocation: {
                    runAs: 'system',
                    arguments: [],
                    environment: {},
                    timeoutSeconds: 60,
                    outputBytes: 1024,
                    exitCodes: { success: [0], reboot: [3010] },
                  },
                  upgrade: 'in_place',
                  uninstall: null,
                  detect: {
                    kind: 'msi_product',
                    productCode: '{11111111-1111-4111-8111-111111111111}',
                    version: '1',
                  },
                },
              },
            },
          },
        ],
      },
    ],
  }
  expect(resourceApplicability(resource, '1', windows)).toBe('applicable')
  expect(resourceApplicability(resource, '1', mac)).toBe('authorization')
  windows.architecture = 'aarch64'
  expect(resourceApplicability(resource, '1', windows)).toBe('unsupported')
})
