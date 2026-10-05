import {
  array,
  boolean,
  closed,
  count,
  digest,
  enumeration,
  identifier,
  integer,
  nullable,
  record,
  string,
  unique,
} from '../../../services/decode'

// Current resource::SoftwareSpec wire. Identity and execution remain backend-owned.
export const softwareFormats = [
  'msi',
  'pkg',
  'bundle',
  'winget',
  'brew',
  'exe',
  'dmg',
  'msix',
] as const
const scope = (v: unknown) => enumeration(v, ['system', 'user'] as const)
const upgrade = (v: unknown) =>
  enumeration(v, ['in_place', 'uninstall_then_install', 'deny'] as const)
function bounded(value: unknown, min: number, max: number) {
  const n = integer(value)
  if (n < min || n > max) throw new Error('Invalid software budget')
  return n
}
function literal(value: unknown): string {
  if (
    typeof value !== 'string' ||
    new TextEncoder().encode(value).length > 4096 ||
    value.includes('\0')
  )
    throw new Error('Invalid literal')
  return value
}
function materialText(value: unknown, max = 1024) {
  const text = string(value)
  if (!text || text.includes('\0') || new TextEncoder().encode(text).length > max)
    throw new Error('Invalid software text')
  return text
}
function dictionary<T>(value: unknown, decode: (v: unknown) => T, max: number): Record<string, T> {
  const entries = Object.entries(record(value))
  if (entries.length > max) throw new Error('Invalid software collection')
  return Object.fromEntries(entries.map(([key, item]) => [identifier(key), decode(item)]))
}
export function softwareSource(value: unknown) {
  const v = closed(value, ['id', 'revision', 'sha256'])
  return {
    id: identifier(v['id']),
    revision: identifier(v['revision']),
    sha256: digest(v['sha256']),
  }
}
export function softwareInvocation(value: unknown) {
  const v = closed(value, [
    'runAs',
    'arguments',
    'environment',
    'timeoutSeconds',
    'outputBytes',
    'exitCodes',
  ])
  const arguments_ = array(v['arguments'], literal),
    environment = dictionary(v['environment'], literal, 32)
  const c = closed(v['exitCodes'], ['success', 'reboot'])
  const code = (v: unknown) => bounded(v, -2147483648, 2147483647)
  const success = unique(array(c['success'], code), (x) => x),
    reboot = unique(array(c['reboot'], code), (x) => x)
  if (
    !success.length ||
    success.length + reboot.length > 32 ||
    success.some((c) => reboot.includes(c)) ||
    arguments_.length > 128 ||
    Object.keys(environment).some((k) => !/^RSS_PARAM_[A-Za-z0-9_]+$/.test(k) || k.length > 128)
  )
    throw new Error('Invalid software invocation')
  return {
    runAs: enumeration(v['runAs'], ['system', 'logged_in_user'] as const),
    arguments: arguments_,
    environment,
    timeoutSeconds: bounded(v['timeoutSeconds'], 1, 86400),
    outputBytes: bounded(v['outputBytes'], 1, 1048576),
    exitCodes: { success, reboot },
  }
}
function script(value: unknown) {
  const v = closed(value, ['interpreter', 'entry', 'invocation'])
  return {
    interpreter: enumeration(v['interpreter'], ['power_shell7', 'posix_sh', 'bash'] as const),
    entry: identifier(v['entry']),
    invocation: softwareInvocation(v['invocation']),
  }
}
function removal(value: unknown) {
  const v = closed(value, ['installer', 'invocation'])
  return { installer: identifier(v['installer']), invocation: softwareInvocation(v['invocation']) }
}
function detection(value: unknown) {
  const kind = enumeration(record(value)['kind'], [
    'msi_product',
    'pkg_receipt',
    'registry',
    'file',
    'script',
  ] as const)
  if (kind === 'script') {
    const v = closed(value, ['kind', 'command'])
    return { kind, command: script(v['command']) }
  }
  if (kind === 'msi_product') {
    const v = closed(value, ['kind', 'productCode', 'version']),
      productCode = identifier(v['productCode'])
    if (!/^\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}$/i.test(productCode))
      throw new Error('Invalid product code')
    return { kind, productCode, version: identifier(v['version']) }
  }
  if (kind === 'pkg_receipt') {
    const v = closed(value, ['kind', 'receipt', 'version'])
    return { kind, receipt: identifier(v['receipt']), version: identifier(v['version']) }
  }
  if (kind === 'registry') {
    const v = closed(value, ['kind', 'scope', 'key', 'value', 'version'])
    return {
      kind,
      scope: scope(v['scope']),
      key: identifier(v['key']),
      value: string(v['value']),
      version: identifier(v['version']),
    }
  }
  const v = closed(value, ['kind', 'scope', 'path', 'version', 'sha256'])
  return {
    kind,
    scope: scope(v['scope']),
    path: identifier(v['path']),
    version: identifier(v['version']),
    sha256: digest(v['sha256']),
  }
}
export function softwareArtifact(value: unknown) {
  const v = closed(value, ['reference', 'origin', 'length', 'sha256']),
    origin = nullable(v['origin'], string)
  if (origin !== null) {
    const url = new URL(origin)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      throw new Error('Invalid artifact origin')
  }
  return {
    reference: identifier(v['reference']),
    origin,
    length: bounded(v['length'], 1, Number.MAX_SAFE_INTEGER),
    sha256: digest(v['sha256']),
  }
}
function native(v: Record<string, unknown>) {
  return {
    installer: identifier(v['installer']),
    scope: scope(v['scope']),
    install: softwareInvocation(v['install']),
    upgradeInvocation: softwareInvocation(v['upgradeInvocation']),
    upgrade: upgrade(v['upgrade']),
    uninstall: nullable(v['uninstall'], removal),
    detect: detection(v['detect']),
  }
}
function manifest(value: unknown) {
  const v = closed(value, ['schema', 'platform', 'architecture', 'entries'])
  return {
    schema: bounded(v['schema'], 1, 1),
    platform: enumeration(v['platform'], ['windows', 'macos'] as const),
    architecture: enumeration(v['architecture'], ['x86_64', 'aarch64'] as const),
    entries: dictionary(
      v['entries'],
      (x) => {
        const e = closed(x, ['length', 'sha256'])
        return { length: count(e['length']), sha256: digest(e['sha256']) }
      },
      4096,
    ),
  }
}
function dmgPayload(value: unknown) {
  const kind = enumeration(record(value)['kind'], ['app_copy', 'contained_pkg'] as const)
  if (kind === 'app_copy') {
    const v = closed(value, ['kind', 'application', 'uninstall']),
      a = closed(v['application'], ['path', 'bundleId', 'version', 'targetName'])
    return {
      kind,
      application: {
        path: identifier(a['path']),
        bundleId: identifier(a['bundleId']),
        version: identifier(a['version']),
        targetName: identifier(a['targetName']),
      },
      uninstall: boolean(v['uninstall']),
    }
  }
  const v = closed(value, ['kind', 'path', 'length', 'sha256', 'receipt', 'uninstall'])
  return {
    kind,
    path: identifier(v['path']),
    length: bounded(v['length'], 1, Number.MAX_SAFE_INTEGER),
    sha256: digest(v['sha256']),
    receipt: identifier(v['receipt']),
    uninstall: nullable(v['uninstall'], removal),
  }
}
function versionQuad(value: unknown) {
  const v = array(value, (x) => bounded(x, 0, 65535))
  if (v.length !== 4) throw new Error('Invalid native version')
  return v
}
function msixIdentity(value: unknown) {
  const v = closed(value, ['name', 'publisher', 'version', 'architecture', 'resourceId'])
  return {
    name: identifier(v['name']),
    publisher: identifier(v['publisher']),
    version: versionQuad(v['version']),
    architecture: enumeration(v['architecture'], ['x86_64', 'aarch64', 'neutral'] as const),
    resourceId: string(v['resourceId']),
  }
}
function msixContainer(value: unknown) {
  const kind = enumeration(record(value)['kind'], ['package', 'bundle'] as const)
  const v = closed(
    value,
    kind === 'package' ? ['kind', 'installer'] : ['kind', 'installer', 'members'],
  )
  const installer = identifier(v['installer'])
  if (kind === 'package') return { kind, installer }
  return {
    kind,
    installer,
    members: array(v['members'], (x) => {
      const m = closed(x, ['path', 'identity', 'length', 'sha256'])
      return {
        path: identifier(m['path']),
        identity: msixIdentity(m['identity']),
        length: bounded(m['length'], 1, Number.MAX_SAFE_INTEGER),
        sha256: digest(m['sha256']),
      }
    }),
  }
}
function deployment(value: unknown) {
  const kind = enumeration(record(value)['kind'], [
    'device_provisioning',
    'target_user_registration',
  ] as const)
  if (kind === 'device_provisioning') {
    closed(value, ['kind'])
    return { kind }
  }
  const v = closed(value, ['kind', 'target']),
    t = record(v['target']),
    targetKind = enumeration(t['kind'], ['active_interactive', 'exact'] as const)
  const target =
    targetKind === 'exact'
      ? { kind: targetKind, identity: identifier(closed(t, ['kind', 'identity'])['identity']) }
      : ({ kind: targetKind, ...closed(t, ['kind']) } as { kind: 'active_interactive' })
  return { kind, target }
}
function behavior(value: unknown) {
  const kind = enumeration(record(value)['kind'], softwareFormats)
  if (kind === 'msi' || kind === 'pkg' || kind === 'winget' || kind === 'brew') {
    return {
      kind,
      ...native(
        closed(value, [
          'kind',
          'installer',
          'scope',
          'install',
          'upgradeInvocation',
          'upgrade',
          'uninstall',
          'detect',
        ]),
      ),
    }
  }
  if (kind === 'exe') {
    const v = closed(value, [
      'kind',
      'installer',
      'scope',
      'install',
      'upgradeInvocation',
      'upgrade',
      'uninstall',
      'detect',
      'layout',
    ])
    return { kind, ...native(v), layout: dictionary(v['layout'], identifier, 64) }
  }
  if (kind === 'bundle') {
    const v = closed(value, ['kind', 'archive', 'manifest', 'install', 'uninstall', 'detect'])
    return {
      kind,
      archive: identifier(v['archive']),
      manifest: manifest(v['manifest']),
      install: script(v['install']),
      uninstall: nullable(v['uninstall'], script),
      detect: detection(v['detect']),
    }
  }
  if (kind === 'dmg') {
    const v = closed(value, [
      'kind',
      'image',
      'volume',
      'scope',
      'invocation',
      'upgrade',
      'payload',
    ])
    return {
      kind,
      image: identifier(v['image']),
      volume: identifier(v['volume']),
      scope: scope(v['scope']),
      invocation: softwareInvocation(v['invocation']),
      upgrade: upgrade(v['upgrade']),
      payload: dmgPayload(v['payload']),
    }
  }
  const v = closed(value, [
    'kind',
    'container',
    'identity',
    'dependencies',
    'deployment',
    'minimumOs',
    'requireSideload',
    'allowUnsigned',
    'uninstall',
    'invocation',
    'upgrade',
  ])
  return {
    kind,
    container: msixContainer(v['container']),
    identity: msixIdentity(v['identity']),
    dependencies: array(v['dependencies'], msixIdentity),
    deployment: deployment(v['deployment']),
    minimumOs: versionQuad(v['minimumOs']),
    requireSideload: boolean(v['requireSideload']),
    allowUnsigned: boolean(v['allowUnsigned']),
    uninstall: boolean(v['uninstall']),
    invocation: softwareInvocation(v['invocation']),
    upgrade: upgrade(v['upgrade']),
  }
}
function provenance(value: unknown) {
  const kind = enumeration(record(value)['kind'], ['private', 'imported'] as const)
  if (kind === 'private') {
    closed(value, ['kind'])
    return { kind }
  }
  const v = closed(value, ['kind', 'snapshot', 'converter', 'files'])
  return {
    kind,
    snapshot: identifier(v['snapshot']),
    converter: identifier(v['converter']),
    files: array(v['files'], (x) => {
      const f = closed(x, ['path', 'content'])
      return { path: identifier(f['path']), content: softwareArtifact(f['content']) }
    }),
  }
}
function softwareExport(value: unknown) {
  const kind = enumeration(record(value)['kind'], ['disabled', 'winget', 'brew'] as const)
  if (kind === 'disabled') {
    closed(value, ['kind'])
    return { kind }
  }
  if (kind === 'winget') {
    const v = closed(value, ['kind', 'locale', 'name', 'publisher', 'description', 'license'])
    return {
      kind,
      locale: identifier(v['locale']),
      name: identifier(v['name']),
      publisher: identifier(v['publisher']),
      description: string(v['description']),
      license: identifier(v['license']),
    }
  }
  const v = closed(value, ['kind', 'name', 'description', 'homepage', 'payload']),
    p = record(v['payload']),
    pk = enumeration(p['kind'], ['cask', 'bottle'] as const)
  const payload =
    pk === 'cask'
      ? (() => {
          const b = closed(p, ['kind', 'path', 'receipts'])
          return {
            kind: pk,
            path: identifier(b['path']),
            receipts: array(b['receipts'], identifier),
          }
        })()
      : (() => {
          const b = closed(p, [
            'kind',
            'artifact',
            'source',
            'tag',
            'cellar',
            'revision',
            'rebuild',
            'executable',
          ])
          return {
            kind: pk,
            artifact: identifier(b['artifact']),
            source: identifier(b['source']),
            tag: identifier(b['tag']),
            cellar: identifier(b['cellar']),
            revision: count(b['revision']),
            rebuild: count(b['rebuild']),
            executable: identifier(b['executable']),
          }
        })()
  return {
    kind,
    name: identifier(v['name']),
    description: string(v['description']),
    homepage: string(v['homepage']),
    payload,
  }
}
export function decodeSoftwareDefinition(value: unknown) {
  const v = closed(value, [
    'source',
    'package',
    'version',
    'provenance',
    'artifacts',
    'behavior',
    'signatures',
    'reboot',
    'downgrade',
    'dependencies',
    'export',
  ])
  const result = {
    source: softwareSource(v['source']),
    package: materialText(v['package']),
    version: materialText(v['version']),
    provenance: provenance(v['provenance']),
    artifacts: dictionary(v['artifacts'], softwareArtifact, 64),
    behavior: behavior(v['behavior']),
    signatures: array(v['signatures'], (x) => {
      const s = closed(x, ['artifact', 'mechanism', 'publisher'])
      return {
        artifact: identifier(s['artifact']),
        mechanism: enumeration(s['mechanism'], [
          'authenticode',
          'apple_developer_id',
          'msix',
        ] as const),
        publisher: identifier(s['publisher']),
      }
    }),
    reboot: enumeration(v['reboot'], ['forbid', 'report'] as const),
    downgrade: enumeration(v['downgrade'], ['deny', 'allow'] as const),
    dependencies: unique(
      array(v['dependencies'], (x) => {
        const d = closed(x, ['resource', 'version', 'sha256'])
        return {
          resource: identifier(d['resource']),
          version: identifier(d['version']),
          sha256: digest(d['sha256']),
        }
      }),
      (d) => d.resource,
    ),
    export: softwareExport(v['export']),
  }
  if (!result.artifacts[softwareInstaller(result)] || result.dependencies.length > 32)
    throw new Error('Incomplete software definition')
  unique(Object.values(result.artifacts), (a) => a.reference)
  return result
}
export type SoftwareDefinition = ReturnType<typeof decodeSoftwareDefinition>
export function softwareInstaller(s: { behavior: ReturnType<typeof behavior> }) {
  const b = s.behavior
  if (b.kind === 'bundle') return b.archive
  if (b.kind === 'dmg') return b.image
  if (b.kind === 'msix') return b.container.installer
  return b.installer
}
export function softwareIdentity(s: SoftwareDefinition) {
  const b = s.behavior
  const invocation =
    b.kind === 'bundle'
      ? b.install.invocation
      : b.kind === 'dmg' || b.kind === 'msix'
        ? b.invocation
        : b.install
  return {
    runAs: invocation.runAs,
    scope: 'scope' in b ? b.scope : null,
    deployment: b.kind === 'msix' ? b.deployment.kind : null,
  }
}
export function supportsSoftwareRemoval(s: SoftwareDefinition) {
  const b = s.behavior
  return b.kind === 'dmg'
    ? b.payload.uninstall !== null && b.payload.uninstall !== false
    : b.uninstall !== null && b.uninstall !== false
}
export function validateSoftwareTarget(
  s: SoftwareDefinition,
  platform: 'windows' | 'macos',
  architecture: 'x86_64' | 'aarch64',
) {
  const b = s.behavior
  const expected =
    b.kind === 'bundle'
      ? b.manifest.platform
      : ['msi', 'winget', 'exe', 'msix'].includes(b.kind)
        ? 'windows'
        : 'macos'
  if (
    expected !== platform ||
    (b.kind === 'bundle' && b.manifest.architecture !== architecture) ||
    (b.kind === 'msix' &&
      b.identity.architecture !== 'neutral' &&
      b.identity.architecture !== architecture)
  )
    throw new Error('Wrong software target')
}
