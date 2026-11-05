import { uuid, revision } from '@rss/mdm-inventory'
import { document, filename, positive, text } from '../values'
import {
  algorithms,
  formats,
  profiles,
  actions,
  type Metadata,
  type Reference,
  type GenerateIntent,
  type ImportIntent,
  type ImportMaterial,
  type Settings,
  type OriginalOperation,
  type Receipt,
} from './model'

export function validateReference(value: Reference): void {
  uuid(value.entryId)
  positive(value.version)
}
export function validateMetadata(value: Metadata): void {
  if (!value || Array.isArray(value)) throw new Error('Invalid archive metadata')
  document(value, 16384)
  text(value.name, 256, true)
  text(value.category, 128, true)
  text(value.owner, 256)
  text(value.notes, 4096)
  for (const [items, maximum] of [
    [value.labels, 128],
    [value.usages, 512],
  ] as const) {
    if (!Array.isArray(items) || items.length > 32) throw new Error('Invalid metadata list')
    for (const item of items) {
      text(item, maximum)
      if (!item) throw new Error('Empty metadata item')
    }
  }
}
export function validatePassword(value: string, initialize = true): void {
  text(value, 1024, true)
  if (initialize && [...value].length < 12)
    throw new Error('Archive password must contain at least twelve characters')
}
export function validateSettings(value: Settings): void {
  if (revision(value.reminderDays) > 3650 || value.categories.length > 128)
    throw new Error('Invalid archive settings')
  value.categories.forEach((category) => text(category, 128, true))
}
export function validateImport(input: ImportIntent, materials: readonly ImportMaterial[]): void {
  uuid(input.operationId)
  uuid(input.entryId)
  revision(input.expectedRevision)
  validateMetadata(input.metadata)
  if (input.requestVersion) validateReference(input.requestVersion)
  if (
    !input.files.length ||
    input.files.length > 16 ||
    input.files.length !== materials.length ||
    new Set(input.files.map((f) => f.name)).size !== input.files.length
  )
    throw new Error('Invalid import file set')
  let bytes = 0
  input.files.forEach((file, i) => {
    filename(file.name)
    if (!formats.includes(file.format)) throw new Error('Invalid archive format')
    const material = materials[i]!
    if (material.name !== file.name || !material.bytes.byteLength)
      throw new Error('Wrong import file')
    bytes += material.bytes.byteLength
    if (material.password !== null) text(material.password, 1024)
  })
  if (bytes > 1024 * 1024) throw new Error('Archive import exceeds one MiB')
}
export function validateGeneration(input: GenerateIntent): void {
  uuid(input.operationId)
  uuid(input.entryId)
  revision(input.expectedRevision)
  validateMetadata(input.metadata)
  if (!profiles.includes(input.profile) || !algorithms.includes(input.algorithm))
    throw new Error('Invalid archive generation kind')
  text(input.commonName, 256, true)
  text(input.organization, 256)
  if (revision(input.days) > 36500 || input.sans.length > 32)
    throw new Error('Invalid generation lifetime or SAN count')
  input.sans.forEach((san) => text(san, 253, true))
  if (input.issuer) validateReference(input.issuer)
  if (input.profile === 'https') {
    if (!input.issuer || !input.sans.length)
      throw new Error('HTTPS requires SANs and an exact issuer version')
  } else if (input.issuer !== null) throw new Error('This profile must not specify an issuer')
  if (input.profile === 'apns_csr' && (input.algorithm !== 'rsa2048' || input.sans.length))
    throw new Error('APNs CSR requires RSA2048 and no SANs')
  if (input.profile === 'scep_template') {
    if (!input.scepUrl) throw new Error('SCEP template requires an HTTPS URL')
    const url = new URL(input.scepUrl)
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash)
      throw new Error('Invalid SCEP URL')
  }
}
export function validateOriginal(input: OriginalOperation): void {
  uuid(input.operationId)
  if (!actions.includes(input.action)) throw new Error('Invalid archive operation action')
  if (input.entryId !== null) uuid(input.entryId)
  if (input.version !== null) positive(input.version)
  if (input.expectedRevision !== null) revision(input.expectedRevision)
  const entryAction = ['import', 'generate', 'export', 'manage', 'metadata'].includes(input.action)
  if (
    entryAction !== (input.entryId !== null) ||
    ['import', 'generate', 'export', 'metadata'].includes(input.action) !== (input.version !== null)
  )
    throw new Error('Wrong archive operation coordinates')
  if (
    ['import', 'generate', 'manage', 'metadata', 'settings'].includes(input.action) !==
    (input.expectedRevision !== null)
  )
    throw new Error('Wrong archive operation revision')
  if (
    ['import', 'generate', 'metadata'].includes(input.action) &&
    input.version !== input.expectedRevision! + 1
  )
    throw new Error('Wrong new material version')
}
export function verifyReceipt(value: Receipt, original: OriginalOperation): Receipt {
  validateOriginal(original)
  if (
    value.operationId !== original.operationId ||
    value.action !== original.action ||
    value.entryId !== original.entryId ||
    value.version !== original.version ||
    !positive(value.revision) ||
    (original.expectedRevision !== null && value.revision !== original.expectedRevision + 1)
  )
    throw new Error('Wrong archive operation receipt')
  return value
}
export function validity(
  facts: readonly {
    readonly format: string
    readonly certificates: readonly { readonly notBefore: number; readonly notAfter: number }[]
  }[],
  now: number,
  reminderDays: number,
) {
  const certificates = facts.flatMap((fact) => fact.certificates)
  if (!certificates.length)
    return facts.some((fact) => fact.format === 'opaque')
      ? 'unparsed'
      : facts.some((fact) => fact.format === 'csr')
        ? 'request'
        : 'key'
  if (certificates.some((certificate) => certificate.notAfter <= now)) return 'expired'
  if (certificates.some((certificate) => certificate.notBefore > now)) return 'not_yet_valid'
  if (certificates.some((certificate) => certificate.notAfter <= now + reminderDays * 86400))
    return 'expiring'
  return 'valid'
}
