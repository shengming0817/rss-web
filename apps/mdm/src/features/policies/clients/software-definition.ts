import {
  array,
  closed,
  count,
  digest,
  enumeration,
  identifier,
  nullable,
  record,
  string,
  unique,
} from '../../../services/decode'

export const softwareFormats = ['msi', 'pkg', 'bundle', 'winget', 'brew'] as const
export function softwareSource(value: unknown) {
  const v = closed(value, ['id', 'revision', 'sha256'])
  return {
    id: identifier(v['id']),
    revision: identifier(v['revision']),
    sha256: digest(v['sha256']),
  }
}
function bounded(value: unknown, min: number, max: number) {
  const n = count(value)
  if (n < min || n > max) throw new Error('Invalid software budget')
  return n
}
function literal(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4096 || value.includes('\0'))
    throw new Error('Invalid literal')
  return value
}
function dictionary<T>(value: unknown, decode: (v: unknown) => T, max: number): Record<string, T> {
  const entries = Object.entries(record(value))
  if (entries.length > max) throw new Error('Invalid software collection')
  return Object.fromEntries(entries.map(([key, item]) => [identifier(key), decode(item)]))
}
export function softwareCommand(value: unknown) {
  const v = closed(value, [
    'executor',
    'entry',
    'runAs',
    'arguments',
    'environment',
    'timeoutSeconds',
    'outputBytes',
  ])
  const args = array(v['arguments'], literal)
  const environment = dictionary(v['environment'], literal, 32)
  if (
    args.length > 128 ||
    Object.keys(environment).some((k) => !/^RSS_PARAM_[A-Za-z0-9_]+$/.test(k) || k.length > 128)
  )
    throw new Error('Invalid software invocation')
  return {
    executor: enumeration(v['executor'], [
      'msi',
      'package_installer',
      'power_shell7',
      'posix_sh',
      'bash',
      'winget',
      'brew',
    ] as const),
    entry: nullable(v['entry'], identifier),
    runAs: enumeration(v['runAs'], ['system', 'logged_in_user'] as const),
    arguments: args,
    environment,
    timeoutSeconds: bounded(v['timeoutSeconds'], 1, 86400),
    outputBytes: bounded(v['outputBytes'], 1, 1_048_576),
  }
}
export type SoftwareCommand = ReturnType<typeof softwareCommand>
export type SoftwareDetection =
  | { kind: 'msi_product'; productCode: string; version: string }
  | { kind: 'pkg_receipt'; receipt: string; version: string }
  | { kind: 'script'; command: SoftwareCommand }
function detection(value: unknown): SoftwareDetection {
  const kind = enumeration(record(value)['kind'], ['msi_product', 'pkg_receipt', 'script'] as const)
  if (kind === 'script') {
    const v = closed(value, ['kind', 'command'])
    return { kind, command: softwareCommand(v['command']) }
  }
  const v = closed(
    value,
    kind === 'msi_product' ? ['kind', 'productCode', 'version'] : ['kind', 'receipt', 'version'],
  )
  return kind === 'msi_product'
    ? { kind, productCode: identifier(v['productCode']), version: identifier(v['version']) }
    : { kind, receipt: identifier(v['receipt']), version: identifier(v['version']) }
}
export function softwareArtifact(value: unknown) {
  const v = closed(value, ['reference', 'origin', 'length', 'sha256'])
  const origin = nullable(v['origin'], string)
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
export function decodeSoftwareDefinition(value: unknown) {
  const v = closed(value, [
    'source',
    'package',
    'version',
    'format',
    'primary',
    'artifacts',
    'install',
    'uninstall',
    'detect',
    'reboot',
    'downgrade',
    'ownership',
    'dependencies',
    'bundle',
  ])
  const artifacts = dictionary(v['artifacts'], softwareArtifact, 64),
    primary = identifier(v['primary'])
  const dependencies = unique(
    array(v['dependencies'], (value) => {
      const d = closed(value, ['resource', 'version', 'sha256'])
      return {
        resource: identifier(d['resource']),
        version: identifier(d['version']),
        sha256: digest(d['sha256']),
      }
    }),
    (d) => d.resource,
  )
  const result = {
    source: softwareSource(v['source']),
    package: identifier(v['package']),
    version: identifier(v['version']),
    format: enumeration(v['format'], softwareFormats),
    primary,
    artifacts,
    install: softwareCommand(v['install']),
    uninstall: nullable(v['uninstall'], softwareCommand),
    detect: detection(v['detect']),
    reboot: enumeration(v['reboot'], ['forbid', 'report'] as const),
    downgrade: enumeration(v['downgrade'], ['deny', 'allow'] as const),
    ownership: enumeration(v['ownership'], ['managed_only', 'allow_user_existing'] as const),
    dependencies,
    bundle: nullable(v['bundle'], (value) => {
      const b = closed(value, ['schema', 'platform', 'architecture', 'entries'])
      return {
        schema: bounded(b['schema'], 1, 1),
        platform: enumeration(b['platform'], ['windows', 'macos'] as const),
        architecture: enumeration(b['architecture'], ['x86_64', 'aarch64'] as const),
        entries: dictionary(
          b['entries'],
          (value) => {
            const e = closed(value, ['length', 'sha256'])
            return { length: count(e['length']), sha256: digest(e['sha256']) }
          },
          4096,
        ),
      }
    }),
  }
  if (
    !artifacts[primary] ||
    dependencies.length > 32 ||
    (result.format === 'bundle') !== (result.bundle !== null)
  )
    throw new Error('Incomplete software definition')
  unique(Object.values(artifacts), (a) => a.reference)
  validateDefinition(result)
  return result
}
export type SoftwareDefinition = ReturnType<typeof decodeSoftwareDefinition>

const scriptExecutors = ['power_shell7', 'posix_sh', 'bash']
function validateDefinition(s: SoftwareDefinition) {
  const expected = {
    msi: 'msi',
    pkg: 'package_installer',
    winget: 'winget',
    brew: 'brew',
    bundle: null,
  }[s.format]
  if (expected ? s.install.executor !== expected : !scriptExecutors.includes(s.install.executor))
    throw new Error('Wrong package executor')
  function command(c: SoftwareCommand) {
    if (scriptExecutors.includes(c.executor)) {
      if (!c.entry || !(s.bundle ? s.bundle.entries[c.entry] : s.artifacts[c.entry]))
        throw new Error('Missing command artifact')
    } else if (c.entry !== null) throw new Error('Unexpected executable entry')
    if (c.executor === 'brew' && c.runAs !== 'logged_in_user')
      throw new Error('Brew requires user identity')
  }
  command(s.install)
  if (s.uninstall) command(s.uninstall)
  if (s.detect.kind === 'script') {
    command(s.detect.command)
    if (!scriptExecutors.includes(s.detect.command.executor))
      throw new Error('Invalid detection executor')
  } else if (s.detect.kind === 'msi_product') {
    if (
      !/^\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}$/i.test(
        s.detect.productCode,
      )
    )
      throw new Error('Invalid product code')
  } else if (!/^[A-Za-z0-9._-]+$/.test(s.detect.receipt)) throw new Error('Invalid receipt')
  if (s.bundle) {
    const names = Object.keys(s.bundle.entries)
    if (!names.length || Object.keys(s.artifacts).length !== 1)
      throw new Error('Invalid bundle members')
    unique(names, (n) => n.toLowerCase())
    for (const name of names) {
      if (
        name.toLowerCase() === 'manifest.json' ||
        /[^\x20-\x7e]|[\\:<>"|?*]/.test(name) ||
        name
          .split('/')
          .some(
            (p) =>
              !p ||
              p === '.' ||
              p === '..' ||
              /[ .]$/.test(p) ||
              /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(p),
          )
      )
        throw new Error('Invalid bundle path')
    }
    const ext = s.bundle.platform === 'windows' ? 'ps1' : 'sh'
    if (
      s.install.entry !== `install.${ext}` ||
      (s.uninstall && s.uninstall.entry !== `uninstall.${ext}`)
    )
      throw new Error('Invalid bundle entry')
  }
}
export function validateSoftwareTarget(
  s: SoftwareDefinition,
  platform: 'windows' | 'macos',
  architecture: 'x86_64' | 'aarch64',
) {
  const allowed =
    platform === 'windows'
      ? ['msi', 'winget', 'power_shell7']
      : ['package_installer', 'brew', 'posix_sh', 'bash']
  if (
    !allowed.includes(s.install.executor) ||
    (s.uninstall && !allowed.includes(s.uninstall.executor)) ||
    (s.detect.kind === 'script' && !allowed.includes(s.detect.command.executor)) ||
    (s.detect.kind === 'msi_product' && platform !== 'windows') ||
    (s.detect.kind === 'pkg_receipt' && platform !== 'macos') ||
    (s.bundle && (s.bundle.platform !== platform || s.bundle.architecture !== architecture))
  )
    throw new Error('Wrong software target')
}
