import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import {
  nextCursor,
  projectedRow,
  queryParameters,
  windowPage,
  windowParameters,
} from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import {
  actions,
  validateMetadata,
  validateSettings,
  type ArchivePort,
  type CertificateFacts,
  type Entry,
  type ExportFile,
  type ExportIntent,
  type MaterialFacts,
  type Metadata,
  type Receipt,
  type SettingsView,
  type Vault,
  type Version,
} from '@rss/mdm-certificates/archive'
import { boolean, count, enumeration, list, nullable, positive, record, text, uuid } from './decode'
import { distinct, integer, requestInput } from './inventory-values'

function metadata(value: unknown): Metadata {
  if (!schema.postApiV1CertificateArchiveImportBody.validateCertificateMetadata(value))
    throw new Error('Invalid archive metadata')
  const result = structuredClone(value) as Metadata
  validateMetadata(result)
  return result
}
function certificate(value: unknown): CertificateFacts {
  if (!schema.getApiV1CertificateArchiveEntriesResponse.validateCertificateFacts(value))
    throw new Error('Invalid certificate facts')
  const result = {
    ...value,
    sans: [...value.sans],
    notBefore: integer(value.notBefore),
    notAfter: integer(value.notAfter),
  }
  if (result.notAfter <= result.notBefore) throw new Error('Invalid certificate validity')
  return result
}
function facts(value: unknown): MaterialFacts {
  if (!schema.getApiV1CertificateArchiveEntriesResponse.validateMaterialFacts(value))
    throw new Error('Invalid material facts')
  return {
    name: value.name,
    format: value.format,
    certificates: value.certificates.map(certificate),
    publicKeys: [...value.publicKeys],
    containsPrivateKey: value.containsPrivateKey,
  }
}
function version(value: unknown): Version {
  if (!schema.getApiV1CertificateArchiveEntriesResponse.validateVersion(value))
    throw new Error('Invalid archive version')
  return {
    entryId: uuid(value.entryId),
    version: positive(value.version),
    actor: text(value.actor),
    instance: uuid(value.instance),
    operationId: uuid(value.operationId),
    createdAt: integer(value.createdAt),
    metadata: metadata(value.metadata),
    facts: value.facts.map(facts),
    requestVersion: nullable(value.requestVersion, (value) => {
      const ref = record(value)
      return { entryId: uuid(ref['entryId']), version: positive(ref['version']) }
    }),
    source: text(value.source),
  }
}
const fields = {
  id: uuid,
  revision: positive,
  retired: boolean,
  recommendedVersion: (value: unknown) => nullable(value, positive),
  latest: version,
}
function entry(value: unknown, id: string): Entry {
  if (!schema.getApiV1CertificateArchiveEntriesByEntryResponse.validateRoot(value))
    throw new Error('Invalid archive detail')
  const result = {
    id: uuid(value.id),
    revision: positive(value.revision),
    retired: value.retired,
    recommendedVersion: nullable(value.recommendedVersion, positive),
    latest: version(value.latest),
  }
  if (result.id !== id || result.latest.entryId !== id || result.revision < result.latest.version)
    throw new Error('Wrong archive detail')
  return result
}
function receipt(value: unknown, id: string): Receipt {
  if (
    !schema.getApiV1CertificateArchiveOperationsByOperationResponse.validateRoot(value) ||
    value.operationId !== id ||
    !value.action.startsWith('certificate_archive_')
  )
    throw new Error('Wrong archive operation')
  return {
    operationId: uuid(value.operationId),
    action: enumeration(value.action.replace(/^certificate_archive_/, ''), actions),
    entryId: nullable(value.entryId, uuid),
    version: nullable(value.version, positive),
    revision: positive(value.revision),
  }
}
function vault(value: unknown): Vault {
  if (!schema.getApiV1CertificateArchiveVaultResponse.validateRoot(value))
    throw new Error('Invalid archive vault state')
  const result = {
    initialized: value.initialized,
    generation: count(value.generation),
    unlockedUntil: nullable(value.unlockedUntil, integer),
  }
  if (
    result.initialized !== result.generation > 0 ||
    (!result.initialized && result.unlockedUntil !== null)
  )
    throw new Error('Wrong archive vault state')
  return result
}
function settings(value: unknown): SettingsView {
  if (!schema.getApiV1CertificateArchiveSettingsResponse.validateRoot(value))
    throw new Error('Invalid archive settings')
  validateSettings(value.value)
  return {
    revision: count(value.revision),
    value: { reminderDays: value.value.reminderDays, categories: [...value.value.categories] },
  }
}
function base64(bytes: ArrayBuffer): string {
  const value = new Uint8Array(bytes)
  let text = ''
  for (let offset = 0; offset < value.length; offset += 16384)
    text += String.fromCharCode(...value.subarray(offset, offset + 16384))
  return btoa(text)
}
function exported(value: unknown, input: ExportIntent): readonly ExportFile[] {
  if (
    !schema.postApiV1CertificateArchiveExportResponse.validateRoot(value) ||
    value.entryId !== input.entryId ||
    value.version !== input.version ||
    !value.files.length ||
    value.files.length > 48
  )
    throw new Error('Wrong archive export')
  const files: ExportFile[] = []
  try {
    let total = 0
    for (const file of value.files) {
      if (
        !file.name ||
        new TextEncoder().encode(file.name).length > 256 ||
        /[\\/\p{Cc}]/u.test(file.name) ||
        file.name === '.' ||
        file.name === '..' ||
        !file.data ||
        file.data.length > 4 * 1024 * 1024 ||
        file.data.length % 4 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data)
      )
        throw new Error('Invalid exported file')
      const decoded = atob(file.data)
      if (btoa(decoded) !== file.data) throw new Error('Invalid export encoding')
      total += decoded.length
      if (total > 4 * 1024 * 1024) throw new Error('Archive export exceeds budget')
      files.push({
        name: file.name,
        bytes: Uint8Array.from(decoded, (c) => c.charCodeAt(0)).buffer,
      })
    }
    distinct(files, (file) => file.name)
    return files
  } catch (error) {
    files.forEach((file) => new Uint8Array(file.bytes).fill(0))
    throw error
  }
}
/** The archive response carries private material in JSON; only this adapter decodes it to owned bytes. */
export function createCertificateArchiveAdapter(
  transport: HttpTransport,
  tenant: string,
): ArchivePort {
  const headers = (operation: string) => ({ 'Idempotency-Key': uuid(operation) })
  return {
    vault: () => api.getApiV1CertificateArchiveVault(transport, {}, vault),
    initialize: (operation, password) =>
      api.postApiV1CertificateArchiveVaultInitialize(
        transport,
        { headers: headers(operation), body: { password } },
        (value) => receipt(value, operation),
      ),
    unlock: (password) =>
      api.postApiV1CertificateArchiveVaultUnlock(transport, { body: { password } }, vault),
    lock: () =>
      api.postApiV1CertificateArchiveVaultLock(transport, {}, (value) => {
        if (!value.locked) throw new Error('Archive lock unconfirmed')
      }),
    changePassword: (operation, oldPassword, newPassword) =>
      api.postApiV1CertificateArchiveVaultPassword(
        transport,
        { headers: headers(operation), body: { oldPassword, newPassword } },
        (value) => receipt(value, operation),
      ),
    list: (query) =>
      api.getApiV1CertificateArchiveEntries(
        transport,
        { query: queryParameters({ limit: 50, ...query }) },
        (value) => {
          const page = record(value)
          if (
            Object.keys(page).sort().join(',') !==
              'alerts,asOf,items,nextCursor,reminderDays,tenantId' ||
            uuid(page['tenantId']) !== tenant
          )
            throw new Error('Wrong archive directory')
          const items = list(page['items'], (item) => projectedRow(item, fields, query.fields)),
            alerts = record(page['alerts']),
            reminderDays = count(page['reminderDays']),
            asOf = integer(page['asOf'])
          if (
            items.length > 200 ||
            reminderDays > 3650 ||
            items.some(
              (item) =>
                ('latest' in item && item.latest!.entryId !== item.id) ||
                ('latest' in item && item.latest!.createdAt > asOf),
            )
          )
            throw new Error('Invalid archive directory facts')
          distinct(items, (item) => item.id)
          return {
            tenantId: tenant,
            items,
            nextCursor: nextCursor(page['nextCursor']),
            asOf,
            reminderDays,
            alerts: {
              expired: count(alerts['expired']),
              expiring: count(alerts['expiring']),
              notYetValid: count(alerts['notYetValid']),
            },
          }
        },
      ),
    entry: (id) =>
      api.getApiV1CertificateArchiveEntriesByEntry(
        transport,
        { pathParams: { entry: id } },
        (value) => entry(value, id),
      ),
    history: (id, query) =>
      api.getApiV1CertificateArchiveEntriesByEntryVersions(
        transport,
        { pathParams: { entry: id }, query: windowParameters({ limit: 50, ...query }) },
        (value) => {
          const page = windowPage(value, version)
          if (page.items.some((item) => item.entryId !== id))
            throw new Error('Wrong archive version history')
          return page
        },
      ),
    import: (input, materials) =>
      api.postApiV1CertificateArchiveImport(
        transport,
        {
          headers: headers(input.operationId),
          body: requestInput(
            {
              entryId: input.entryId,
              expectedRevision: input.expectedRevision,
              metadata: input.metadata,
              requestVersion: input.requestVersion,
              files: input.files.map((file, i) => ({
                name: file.name,
                format: file.format,
                data: base64(materials[i]!.bytes),
                password: materials[i]!.password,
              })),
            },
            schema.postApiV1CertificateArchiveImportBody.validateRoot,
          ),
        },
        (value) => receipt(value, input.operationId),
      ),
    generate: (input) =>
      api.postApiV1CertificateArchiveGenerate(
        transport,
        {
          headers: headers(input.operationId),
          body: requestInput(
            {
              entryId: input.entryId,
              expectedRevision: input.expectedRevision,
              metadata: input.metadata,
              profile: input.profile,
              algorithm: input.algorithm,
              commonName: input.commonName,
              organization: input.organization,
              sans: input.sans,
              days: input.days,
              issuer: input.issuer,
              scepUrl: input.scepUrl,
            },
            schema.postApiV1CertificateArchiveGenerateBody.validateRoot,
          ),
        },
        (value) => receipt(value, input.operationId),
      ),
    metadata: (input) =>
      api.putApiV1CertificateArchiveEntriesByEntryMetadata(
        transport,
        {
          pathParams: { entry: input.entryId },
          headers: headers(input.operationId),
          body: requestInput(
            { expectedRevision: input.expectedRevision, metadata: input.metadata },
            schema.putApiV1CertificateArchiveEntriesByEntryMetadataBody.validateRoot,
          ),
        },
        (value) => receipt(value, input.operationId),
      ),
    manage: (input) =>
      api.putApiV1CertificateArchiveEntriesByEntry(
        transport,
        {
          pathParams: { entry: input.entryId },
          headers: headers(input.operationId),
          body: {
            expectedRevision: input.expectedRevision,
            retired: input.retired,
            recommendedVersion: input.recommendedVersion,
          },
        },
        (value) => receipt(value, input.operationId),
      ),
    export: (input, signal) =>
      api.postApiV1CertificateArchiveExport(
        transport,
        {
          headers: headers(input.operationId),
          body: { entryId: input.entryId, version: input.version },
          signal,
        },
        (value) => exported(value, input),
      ),
    operation: (operation) =>
      api.getApiV1CertificateArchiveOperationsByOperation(
        transport,
        { pathParams: { operation } },
        (value) => receipt(value, operation),
      ),
    settings: () => api.getApiV1CertificateArchiveSettings(transport, {}, settings),
    saveSettings: (input) =>
      api.putApiV1CertificateArchiveSettings(
        transport,
        {
          headers: headers(input.operationId),
          body: requestInput(
            { expectedRevision: input.expectedRevision, value: input.value },
            schema.putApiV1CertificateArchiveSettingsBody.validateRoot,
          ),
        },
        (value) => receipt(value, input.operationId),
      ),
  }
}
