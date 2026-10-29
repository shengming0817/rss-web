import * as wireSchemas from '@rss/api/mdm-schemas'
import * as wireValidators from '@rss/api/mdm-validators'
import {
  array,
  count,
  digest,
  enumeration,
  identifier,
  integer,
  nullable,
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
  if (!text || /\p{Cc}/u.test(text) || new TextEncoder().encode(text).length > max)
    throw new Error('Invalid software text')
  return text
}
function dictionary<V, T>(
  value: Readonly<Record<string, V>>,
  decode: (v: V) => T,
  max: number,
  keyDecode = identifier,
): Record<string, T> {
  const entries = Object.entries(value)
  if (entries.length > max) throw new Error('Invalid software collection')
  return Object.fromEntries(entries.map(([key, item]) => [keyDecode(key), decode(item)]))
}
export function softwareSource(value: unknown) {
  if (!wireSchemas.postApiV1ResourcesByIdBody.validateSoftwareSource(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    id: identifier(v['id']),
    revision: identifier(v['revision']),
    sha256: digest(v['sha256']),
  }
}
export function softwareInvocation(value: unknown) {
  if (!wireValidators.validateNativeInvocation(value)) throw new Error('Invalid software contract')

  const v = value
  const arguments_ = array(v['arguments'], literal),
    environment = dictionary(v['environment'], literal, 32)
  const c = v['exitCodes']
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
    runAs: v['runAs'],
    arguments: arguments_,
    environment,
    timeoutSeconds: bounded(v['timeoutSeconds'], 1, 86400),
    outputBytes: bounded(v['outputBytes'], 1, 1048576),
    exitCodes: { success, reboot },
  }
}
function script(value: unknown) {
  if (!wireValidators.validateSoftwareScript(value)) throw new Error('Invalid software contract')

  const v = value
  return {
    interpreter: v['interpreter'],
    entry: materialText(v['entry']),
    invocation: softwareInvocation(v['invocation']),
  }
}
function removal(value: unknown) {
  if (!wireValidators.validateNativeRemoval(value)) throw new Error('Invalid software contract')

  const v = value
  return { installer: identifier(v['installer']), invocation: softwareInvocation(v['invocation']) }
}
function detection(value: unknown) {
  if (!wireValidators.validateSoftwareDetection(value)) throw new Error('Invalid software contract')

  const kind = value['kind']
  if (kind === 'script') {
    const v = value
    return { kind, command: script(v['command']) }
  }
  if (kind === 'msi_product') {
    const v = value,
      productCode = identifier(v['productCode'])
    if (!/^\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}$/i.test(productCode))
      throw new Error('Invalid product code')
    return { kind, productCode, version: materialText(v['version']) }
  }
  if (kind === 'pkg_receipt') {
    const v = value
    return { kind, receipt: materialText(v['receipt'], 255), version: materialText(v['version']) }
  }
  if (kind === 'registry') {
    const v = value
    return {
      kind,
      scope: scope(v['scope']),
      key: materialText(v['key']),
      value: materialText(v['value'], 255),
      version: materialText(v['version']),
    }
  }
  const v = value
  return {
    kind,
    scope: scope(v['scope']),
    path: materialText(v['path']),
    version: materialText(v['version']),
    sha256: digest(v['sha256']),
  }
}
export function softwareArtifact(value: unknown) {
  if (!wireValidators.validateSoftwareArtifact(value)) throw new Error('Invalid software contract')

  const v = value,
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
  if (!wireValidators.validateBundleManifest(value)) throw new Error('Invalid software contract')

  const v = value
  return {
    schema: bounded(v['schema'], 1, 1),
    platform: v['platform'],
    architecture: v['architecture'],
    entries: dictionary(
      v['entries'],
      (x) => {
        const e = x
        return { length: count(e['length']), sha256: digest(e['sha256']) }
      },
      4096,
      materialText,
    ),
  }
}
function dmgPayload(value: unknown) {
  if (!wireValidators.validateDmgPayload(value)) throw new Error('Invalid software contract')

  const kind = value['kind']
  if (kind === 'app_copy') {
    const v = value,
      a = v['application']
    return {
      kind,
      application: {
        path: materialText(a['path']),
        bundleId: materialText(a['bundleId'], 255),
        version: materialText(a['version']),
        targetName: materialText(a['targetName']),
      },
      uninstall: v['uninstall'],
    }
  }
  const v = value
  return {
    kind,
    path: materialText(v['path']),
    length: bounded(v['length'], 1, Number.MAX_SAFE_INTEGER),
    sha256: digest(v['sha256']),
    receipt: materialText(v['receipt'], 255),
    uninstall: nullable(v['uninstall'], removal),
  }
}
function versionQuad(value: unknown) {
  const v = array(value, (x) => bounded(x, 0, 65535))
  if (v.length !== 4) throw new Error('Invalid native version')
  return v
}
function msixIdentity(value: unknown) {
  if (!wireValidators.validateMsixIdentity(value)) throw new Error('Invalid software contract')

  const v = value
  return {
    name: materialText(v['name'], 255),
    publisher: materialText(v['publisher']),
    version: versionQuad(v['version']),
    architecture: v['architecture'],
    resourceId: string(v['resourceId']),
  }
}
function msixContainer(value: unknown) {
  if (!wireValidators.validateMsixContainer(value)) throw new Error('Invalid software contract')

  const v = value
  const kind = v.kind
  const installer = identifier(v['installer'])
  if (kind === 'package') return { kind, installer }
  return {
    kind,
    installer,
    members: array(v['members'], (x) => {
      const m = x
      return {
        path: materialText(m['path']),
        identity: msixIdentity(m['identity']),
        length: bounded(m['length'], 1, Number.MAX_SAFE_INTEGER),
        sha256: digest(m['sha256']),
      }
    }),
  }
}
function deployment(value: unknown) {
  if (!wireValidators.validateMsixDeployment(value)) throw new Error('Invalid software contract')

  const kind = value['kind']
  if (kind === 'device_provisioning') {
    return { kind }
  }
  const v = value,
    t = v['target'],
    targetKind = t['kind']
  const target =
    targetKind === 'exact'
      ? { kind: targetKind, identity: identifier(t['identity']) }
      : ({ ...t } as { kind: 'active_interactive' })
  return { kind, target }
}
export function softwareBehavior(value: unknown) {
  if (!wireValidators.validateSoftwareBehavior(value)) throw new Error('Invalid software contract')

  const kind = value['kind']
  if (kind === 'msi' || kind === 'pkg' || kind === 'winget' || kind === 'brew') {
    return {
      kind,
      ...native(value),
    }
  }
  if (kind === 'exe') {
    const v = value
    return { kind, ...native(v), layout: dictionary(v['layout'], identifier, 64, materialText) }
  }
  if (kind === 'bundle') {
    const v = value
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
    const v = value
    return {
      kind,
      image: identifier(v['image']),
      volume: materialText(v['volume'], 255),
      scope: scope(v['scope']),
      invocation: softwareInvocation(v['invocation']),
      upgrade: upgrade(v['upgrade']),
      payload: dmgPayload(v['payload']),
    }
  }
  const v = value
  return {
    kind,
    container: msixContainer(v['container']),
    identity: msixIdentity(v['identity']),
    dependencies: array(v['dependencies'], msixIdentity),
    deployment: deployment(v['deployment']),
    minimumOs: versionQuad(v['minimumOs']),
    requireSideload: v['requireSideload'],
    allowUnsigned: v['allowUnsigned'],
    uninstall: v['uninstall'],
    invocation: softwareInvocation(v['invocation']),
    upgrade: upgrade(v['upgrade']),
  }
}
function provenance(value: unknown) {
  if (!wireValidators.validateSoftwareProvenance(value))
    throw new Error('Invalid software contract')

  const kind = value['kind']
  if (kind === 'private') {
    return { kind }
  }
  const v = value
  return {
    kind,
    snapshot: materialText(v['snapshot'], 128),
    converter: materialText(v['converter'], 128),
    files: array(v['files'], (x) => {
      const f = x
      return { path: materialText(f['path']), content: softwareArtifact(f['content']) }
    }),
  }
}
function softwareExport(value: unknown) {
  if (!wireValidators.validateSoftwareExport(value)) throw new Error('Invalid software contract')

  const kind = value['kind']
  if (kind === 'disabled') {
    return { kind }
  }
  if (kind === 'winget') {
    const v = value
    return {
      kind,
      locale: materialText(v['locale'], 4096),
      name: materialText(v['name'], 4096),
      publisher: materialText(v['publisher'], 4096),
      description: materialText(v['description'], 4096),
      license: materialText(v['license'], 4096),
    }
  }
  const v = value,
    p = v['payload'],
    pk = p['kind']
  const payload =
    pk === 'cask'
      ? (() => {
          const b = p
          return {
            kind: pk,
            path: materialText(b['path']),
            receipts: array(b['receipts'], string),
          }
        })()
      : (() => {
          const b = p
          return {
            kind: pk,
            artifact: identifier(b['artifact']),
            source: identifier(b['source']),
            tag: materialText(b['tag'], 255),
            cellar: materialText(b['cellar'], 255),
            revision: count(b['revision']),
            rebuild: count(b['rebuild']),
            executable: materialText(b['executable'], 255),
          }
        })()
  return {
    kind,
    name: materialText(v['name'], 4096),
    description: materialText(v['description'], 4096),
    homepage: materialText(v['homepage'], 4096),
    payload,
  }
}
function softwareMaterial(value: unknown) {
  if (!wireValidators.validateSoftwareMaterial(value)) throw new Error('Invalid software contract')

  const v = value
  return {
    bundle_id: nullable(v['bundle_id'], (value) => materialText(value, 255)),
    format: v['format'],
    installer: identifier(v['installer']),
  }
}
export function decodeSoftwareDefinition(value: unknown) {
  if (!wireValidators.validateSoftwareDefinition(value))
    throw new Error('Invalid software contract')

  const v = value
  const result = {
    source: softwareSource(v['source']),
    package: materialText(v['package']),
    version: materialText(v['version']),
    provenance: provenance(v['provenance']),
    artifacts: dictionary(v['artifacts'], softwareArtifact, 64),
    material: softwareMaterial(v['material']),
    behavior: nullable(v['behavior'], softwareBehavior),
    signatures: array(v['signatures'], (x) => {
      const s = x
      return {
        artifact: identifier(s['artifact']),
        mechanism: s['mechanism'],
        publisher: materialText(s['publisher']),
      }
    }),
    reboot: v['reboot'],
    downgrade: v['downgrade'],
    dependencies: unique(
      array(v['dependencies'], (x) => {
        const d = x
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
  if (
    result.behavior &&
    (result.behavior.kind !== result.material.format ||
      behaviorInstaller(result.behavior) !== result.material.installer)
  )
    throw new Error('Material and behavior differ')
  unique(Object.values(result.artifacts), (a) => a.reference)
  return result
}
export type SoftwareDefinition = ReturnType<typeof decodeSoftwareDefinition>
function behaviorInstaller(b: ReturnType<typeof softwareBehavior>) {
  if (b.kind === 'bundle') return b.archive
  if (b.kind === 'dmg') return b.image
  if (b.kind === 'msix') return b.container.installer
  return b.installer
}
export function softwareInstaller(s: { material: { installer: string } }) {
  return s.material.installer
}
export function softwareIdentity(s: SoftwareDefinition) {
  const b = s.behavior
  if (!b) return { runAs: null, scope: null, deployment: null }
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
  if (!b) return false
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
  if (s.material.format === 'bundle' && b?.kind !== 'bundle')
    throw new Error('Bundle behavior required')
  const expected =
    b?.kind === 'bundle'
      ? b.manifest.platform
      : ['msi', 'winget', 'exe', 'msix'].includes(s.material.format)
        ? 'windows'
        : 'macos'
  if (
    expected !== platform ||
    (b?.kind === 'bundle' && b.manifest.architecture !== architecture) ||
    (b?.kind === 'msix' &&
      b.identity.architecture !== 'neutral' &&
      b.identity.architecture !== architecture)
  )
    throw new Error('Wrong software target')
}
