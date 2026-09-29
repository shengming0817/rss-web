import { expect, it } from 'vitest'
import { decodeSoftwareDefinition, validateSoftwareTarget } from './software-definition'
const digest = Array<number>(32).fill(1)
const command = {
  executor: 'msi',
  entry: null,
  runAs: 'system',
  arguments: ['literal\nargument'],
  environment: {},
  timeoutSeconds: 60,
  outputBytes: 1024,
}
const spec = {
  source: { id: 'private', revision: '1', sha256: digest },
  package: 'app',
  version: '1',
  format: 'msi',
  primary: 'installer',
  artifacts: { installer: { reference: 'content', origin: null, length: 1, sha256: digest } },
  install: command,
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
}
it('preserves literal command arguments while rejecting unsafe or incomplete package definitions', () => {
  expect(decodeSoftwareDefinition(spec).install.arguments).toEqual(['literal\nargument'])
  for (const bad of [
    { ...spec, format: 'pkg' },
    { ...spec, install: { ...command, executor: 'power_shell7', entry: 'missing' } },
    { ...spec, install: { ...command, executor: 'brew', runAs: 'system' }, format: 'brew' },
    {
      ...spec,
      dependencies: [
        { resource: 'a', version: '1', sha256: digest },
        { resource: 'a', version: '2', sha256: digest },
      ],
    },
    {
      ...spec,
      artifacts: {
        installer: { ...spec.artifacts.installer, origin: 'https://user:secret@example.test/a' },
      },
    },
    { ...spec, detect: { ...spec.detect, productCode: 'not-guid' } },
  ])
    expect(() => decodeSoftwareDefinition(bad)).toThrow()
  const good = decodeSoftwareDefinition(spec)
  expect(() => validateSoftwareTarget(good, 'windows', 'x86_64')).not.toThrow()
  expect(() => validateSoftwareTarget(good, 'macos', 'aarch64')).toThrow()
})
