import { expect, it } from 'vitest'
import {
  decodeSoftwareDefinition,
  softwareIdentity,
  softwareInstaller,
  supportsSoftwareRemoval,
  validateSoftwareTarget,
} from './software-definition'
const digest = Array<number>(32).fill(1)
const invocation = {
  runAs: 'system',
  arguments: ['literal\nargument'],
  environment: {},
  timeoutSeconds: 60,
  outputBytes: 1024,
  exitCodes: { success: [0], reboot: [3010] },
}
const detect = {
  kind: 'msi_product',
  productCode: '{11111111-1111-4111-8111-111111111111}',
  version: '1',
}
const native = {
  installer: 'installer',
  scope: 'system',
  install: invocation,
  upgradeInvocation: invocation,
  upgrade: 'in_place',
  uninstall: null,
  detect,
}
const spec = {
  source: { id: 'private', revision: '1', sha256: digest },
  package: 'app',
  version: '1',
  provenance: { kind: 'private' },
  artifacts: { installer: { reference: 'content', origin: null, length: 1, sha256: digest } },
  behavior: { kind: 'msi', ...native },
  signatures: [],
  reboot: 'report',
  downgrade: 'deny',
  dependencies: [],
  export: { kind: 'disabled' },
}
it('preserves the canonical material and literal arguments, rejecting retired wire and malformed nested values', () => {
  expect(decodeSoftwareDefinition(spec)).toEqual(spec)
  for (const bad of [
    { ...spec, format: 'msi' },
    { ...spec, behavior: { ...spec.behavior, install: { ...invocation, executor: 'msi' } } },
    { ...spec, behavior: { ...spec.behavior, installer: 'missing' } },
    {
      ...spec,
      behavior: {
        ...spec.behavior,
        install: { ...invocation, exitCodes: { success: [0], reboot: [0] } },
      },
    },
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
    { ...spec, behavior: { ...spec.behavior, detect: { ...detect, productCode: 'bad' } } },
  ])
    expect(() => decodeSoftwareDefinition(bad)).toThrow()
  const good = decodeSoftwareDefinition(spec)
  expect(() => validateSoftwareTarget(good, 'windows', 'x86_64')).not.toThrow()
  expect(() => validateSoftwareTarget(good, 'macos', 'aarch64')).toThrow()
})
const script = { interpreter: 'power_shell7', entry: 'install.ps1', invocation }
const identity = {
  name: 'Example.App',
  publisher: 'CN=Example',
  version: [1, 0, 0, 0],
  architecture: 'x86_64',
  resourceId: '',
}
it.each([
  [{ kind: 'msi', ...native }, 'system', 'system'],
  [{ kind: 'pkg', ...native }, 'system', 'system'],
  [{ kind: 'winget', ...native }, 'system', 'system'],
  [
    {
      kind: 'brew',
      ...native,
      scope: 'user',
      install: { ...invocation, runAs: 'logged_in_user' },
      upgradeInvocation: { ...invocation, runAs: 'logged_in_user' },
    },
    'logged_in_user',
    'user',
  ],
  [{ kind: 'exe', ...native, layout: { 'setup.exe': 'installer' } }, 'system', 'system'],
  [
    {
      kind: 'bundle',
      archive: 'installer',
      manifest: {
        schema: 1,
        platform: 'windows',
        architecture: 'x86_64',
        entries: { 'install.ps1': { length: 1, sha256: digest } },
      },
      install: script,
      uninstall: null,
      detect,
    },
    'system',
    null,
  ],
  [
    {
      kind: 'dmg',
      image: 'installer',
      volume: 'App',
      scope: 'user',
      invocation: { ...invocation, runAs: 'logged_in_user' },
      upgrade: 'in_place',
      payload: {
        kind: 'app_copy',
        application: {
          path: 'App.app',
          bundleId: 'com.example.app',
          version: '1',
          targetName: 'App.app',
        },
        uninstall: true,
      },
    },
    'logged_in_user',
    'user',
  ],
  [
    {
      kind: 'msix',
      container: { kind: 'package', installer: 'installer' },
      identity,
      dependencies: [],
      deployment: { kind: 'device_provisioning' },
      minimumOs: [10, 0, 19041, 0],
      requireSideload: true,
      allowUnsigned: false,
      uninstall: true,
      invocation,
      upgrade: 'in_place',
    },
    'system',
    null,
  ],
])(
  'reads identity from each behavior without constructing an identity override',
  (behavior, runAs, scope) => {
    const definition = decodeSoftwareDefinition({ ...spec, behavior })
    expect(softwareIdentity(definition)).toMatchObject({ runAs, scope })
    expect(softwareInstaller(definition)).toBe('installer')
    expect(supportsSoftwareRemoval(definition)).toBe(
      behavior.kind === 'dmg' || behavior.kind === 'msix',
    )
  },
)
