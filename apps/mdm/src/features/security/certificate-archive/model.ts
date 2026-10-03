import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  integer,
  nullable,
  string,
  unique,
  uuid,
} from '../../../services/decode'
export const formats = ['certificate', 'chain', 'csr', 'pkcs12', 'private_key', 'opaque'] as const
export type Format = (typeof formats)[number]
export const profiles = ['ca', 'https', 'csr', 'apns_csr', 'scep_template'] as const
export type Profile = (typeof profiles)[number]
export type Algorithm = 'rsa2048' | 'rsa3072' | 'p256'
export interface Metadata {
  name: string
  category: string
  labels: string[]
  usages: string[]
  owner: string
  notes: string
}
export interface Reference {
  entryId: string
  version: number
}
export interface ImportInput {
  entryId: string
  expectedRevision: number
  metadata: Metadata
  files: { name: string; format: Format; data: string; password: string | null }[]
  requestVersion: Reference | null
}
export interface GenerateInput {
  entryId: string
  expectedRevision: number
  metadata: Metadata
  profile: Profile
  algorithm: Algorithm
  commonName: string
  organization: string
  sans: string[]
  days: number
  issuer: Reference | null
  scepUrl: string | null
}
function text(value: unknown) {
  if (typeof value !== 'string' || value.length > 4096 || value.includes('\0'))
    throw new Error('Invalid text')
  return value
}
function positive(value: unknown) {
  const v = count(value)
  if (!v) throw new Error('Invalid revision')
  return v
}
function fingerprint(value: unknown) {
  const v = string(value)
  if (!/^[0-9a-f]{64}$/.test(v)) throw new Error('Invalid fingerprint')
  return v
}
export function metadata(value: unknown): Metadata {
  const v = closed(value, ['name', 'category', 'labels', 'usages', 'owner', 'notes'])
  return {
    name: string(v['name']),
    category: string(v['category']),
    labels: array(v['labels'], string),
    usages: array(v['usages'], string),
    owner: string(v['owner']),
    notes: text(v['notes']),
  }
}
export function certificate(value: unknown) {
  const v = closed(value, [
    'subject',
    'issuer',
    'sans',
    'serial',
    'fingerprint',
    'algorithm',
    'notBefore',
    'notAfter',
    'publicKey',
  ])
  const result = {
    subject: text(v['subject']),
    issuer: text(v['issuer']),
    sans: array(v['sans'], string),
    serial: string(v['serial']),
    fingerprint: fingerprint(v['fingerprint']),
    algorithm: string(v['algorithm']),
    notBefore: integer(v['notBefore']),
    notAfter: integer(v['notAfter']),
    publicKey: fingerprint(v['publicKey']),
  }
  if (result.notAfter <= result.notBefore) throw new Error('Invalid validity')
  return result
}
export function material(value: unknown) {
  const v = closed(value, ['name', 'format', 'certificates', 'publicKeys', 'containsPrivateKey'])
  return {
    name: string(v['name']),
    format: enumeration(v['format'], formats),
    certificates: array(v['certificates'], certificate),
    publicKeys: array(v['publicKeys'], fingerprint),
    containsPrivateKey: boolean(v['containsPrivateKey']),
  }
}
export function version(value: unknown) {
  const v = closed(value, [
    'entryId',
    'version',
    'actor',
    'instance',
    'operationId',
    'createdAt',
    'metadata',
    'facts',
    'source',
  ])
  return {
    entryId: uuid(v['entryId']),
    version: positive(v['version']),
    actor: uuid(v['actor']),
    instance: uuid(v['instance']),
    operationId: uuid(v['operationId']),
    createdAt: count(v['createdAt']),
    metadata: metadata(v['metadata']),
    facts: array(v['facts'], material),
    source: enumeration(v['source'], ['import', 'generate', 'metadata'] as const),
  }
}
export type Version = ReturnType<typeof version>
export function entry(value: unknown) {
  const v = closed(value, ['id', 'revision', 'retired', 'recommendedVersion', 'latest']),
    result = {
      id: uuid(v['id']),
      revision: positive(v['revision']),
      retired: boolean(v['retired']),
      recommendedVersion: nullable(v['recommendedVersion'], positive),
      latest: version(v['latest']),
    }
  if (result.id !== result.latest.entryId || result.revision < result.latest.version)
    throw new Error('Wrong entry version')
  return result
}
export type Entry = ReturnType<typeof entry>
export function vault(value: unknown) {
  const v = closed(value, ['initialized', 'generation', 'unlockedUntil']),
    result = {
      initialized: boolean(v['initialized']),
      generation: count(v['generation']),
      unlockedUntil: nullable(v['unlockedUntil'], count),
    }
  if (
    result.initialized !== result.generation > 0 ||
    (!result.initialized && result.unlockedUntil !== null)
  )
    throw new Error('Wrong vault state')
  return result
}
export type Vault = ReturnType<typeof vault>
export function settings(value: unknown) {
  const v = closed(value, ['revision', 'value']),
    input = closed(v['value'], ['reminderDays', 'categories']),
    reminderDays = count(input['reminderDays'])
  if (reminderDays > 3650) throw new Error('Invalid reminder window')
  return {
    revision: count(v['revision']),
    value: { reminderDays, categories: array(input['categories'], string) },
  }
}
export function receipt(value: unknown, operation: string) {
  const v = closed(value, ['operationId', 'action', 'entryId', 'version', 'revision']),
    result = {
      operationId: uuid(v['operationId']),
      action: enumeration(v['action'], [
        'certificate_archive_initialize',
        'certificate_archive_password_change',
        'certificate_archive_import',
        'certificate_archive_generate',
        'certificate_archive_export',
        'certificate_archive_settings',
        'certificate_archive_manage',
        'certificate_archive_metadata',
      ] as const),
      entryId: nullable(v['entryId'], uuid),
      version: nullable(v['version'], positive),
      revision: positive(v['revision']),
    }
  if (result.operationId !== operation) throw new Error('Wrong operation receipt')
  return result
}
function alerts(value: unknown) {
  const v = closed(value, ['expired', 'expiring', 'notYetValid'])
  return {
    expired: count(v['expired']),
    expiring: count(v['expiring']),
    notYetValid: count(v['notYetValid']),
  }
}
export function page(value: unknown, tenant: string) {
  const v = closed(value, ['tenantId', 'items', 'nextAfter', 'asOf', 'reminderDays', 'alerts']),
    result = {
      tenantId: uuid(v['tenantId']),
      items: unique(array(v['items'], entry), (v) => v.id),
      nextAfter: nullable(v['nextAfter'], uuid),
      asOf: count(v['asOf']),
      reminderDays: count(v['reminderDays']),
      alerts: alerts(v['alerts']),
    }
  if (
    result.tenantId !== tenant ||
    result.items.length > 50 ||
    result.reminderDays > 3650 ||
    result.items.some((e) => e.latest.createdAt > result.asOf) ||
    (result.nextAfter !== null && result.nextAfter !== result.items.at(-1)?.id)
  )
    throw new Error('Wrong archive page')
  return result
}
export function exported(value: unknown, id: Reference) {
  const v = closed(value, ['entryId', 'version', 'files']),
    entryId = uuid(v['entryId']),
    revision = positive(v['version'])
  if (entryId !== id.entryId || revision !== id.version) throw new Error('Wrong exported version')
  const files = unique(
    array(v['files'], (value) => {
      const f = closed(value, ['name', 'data']),
        name = string(f['name']),
        data = f['data']
      if (
        !name ||
        name.includes('/') ||
        name.includes('\\') ||
        typeof data !== 'string' ||
        !data ||
        data.length > 4 * 1024 * 1024 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(data) ||
        data.length % 4
      )
        throw new Error('Invalid export file')
      return { name, data }
    }),
    (f) => f.name,
  )
  if (!files.length || files.length > 48) throw new Error('Invalid export files')
  return files
}
export type Validity =
  | 'unparsed'
  | 'request'
  | 'not_yet_valid'
  | 'valid'
  | 'expiring'
  | 'expired'
  | 'key'
export function validity(facts: Version['facts'], now: number, days: number): Validity {
  const certificates = facts.flatMap((f) => f.certificates)
  if (!certificates.length)
    return facts.some((f) => f.format === 'opaque')
      ? 'unparsed'
      : facts.some((f) => f.format === 'csr')
        ? 'request'
        : 'key'
  if (certificates.some((c) => c.notAfter <= now)) return 'expired'
  if (certificates.some((c) => c.notBefore > now)) return 'not_yet_valid'
  if (certificates.some((c) => c.notAfter <= now + days * 86400)) return 'expiring'
  return 'valid'
}
