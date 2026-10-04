import { expect, it } from 'vitest'
import { makeDevices } from '../devices/fixtures'
import { configurationApplicability, resourceApplicability } from './applicability'
import type { Configuration } from '../../src/features/policies/clients/configurations'
import type { ResourceRead } from '../../src/features/policies/clients/resources'
it('requires the exact Agent variant and keeps native configuration conflicts in the shared evaluator', () => {
  const devices = makeDevices(),
    windows = devices.get('device-01')!,
    mac = devices.get('device-02')!
  const resource: ResourceRead = {
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
                format: 'msi',
                primary: 'installer',
                artifacts: {
                  installer: {
                    reference: 'pkg',
                    origin: null,
                    length: 1,
                    sha256: Array(32).fill(2),
                  },
                },
                install: {
                  executor: 'msi',
                  entry: null,
                  runAs: 'system',
                  arguments: [],
                  environment: {},
                  timeoutSeconds: 60,
                  outputBytes: 1024,
                },
                uninstall: null,
                detect: {
                  kind: 'msi_product',
                  productCode: '{11111111-1111-4111-8111-111111111111}',
                  version: '1',
                },
                reboot: 'report',
                downgrade: 'deny',
                ownership: 'managed_only',
                dependencies: [],
                bundle: null,
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
  const config: Configuration = {
    id: 'one',
    revision: 1,
    name: 'Camera',
    platform: 'windows',
    format: 'windows_csp',
    versions: [{ version: 1, status: 'published', settings: [{ key: 'Camera', value: false }] }],
  }
  expect(
    configurationApplicability(config, 1, windows, [
      { id: config.id, platform: config.platform, settings: config.versions[0]!.settings },
    ]),
  ).toBe('applicable')
  expect(
    configurationApplicability(config, 1, windows, [
      { id: config.id, platform: config.platform, settings: config.versions[0]!.settings },
      {
        ...config,
        id: 'two',
        settings: [{ key: 'Camera', value: true }],
      },
    ]),
  ).toBe('conflict')
})
