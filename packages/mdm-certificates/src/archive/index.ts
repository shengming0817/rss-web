export type * from './model'
export { formats, profiles, algorithms, actions } from './model'
export * from './authoring'
import type { DirectoryQuery, WindowQuery } from '@rss/mdm-devices'
import { freeze, uuid, revision } from '@rss/mdm-inventory'
import { filename, positive } from '../values'
import {
  validateGeneration,
  validateImport,
  validateMetadata,
  validateOriginal,
  validatePassword,
  validateReference,
  validateSettings,
  verifyReceipt,
} from './authoring'
import type {
  ArchivePort,
  Entry,
  GenerateIntent,
  ImportIntent,
  ImportMaterial,
  ManageIntent,
  MetadataIntent,
  OriginalOperation,
  SettingsIntent,
  ExportIntent,
} from './model'

export function createCertificateArchive(port: ArchivePort, tenant: string) {
  uuid(tenant)
  const original = (
    operationId: string,
    action: OriginalOperation['action'],
    entryId: string | null = null,
    version: number | null = null,
    expectedRevision: number | null = null,
  ): OriginalOperation => freeze({ operationId, action, entryId, version, expectedRevision })
  return Object.freeze({
    vault: () => port.vault(),
    async initialize(operationId: string, password: string) {
      uuid(operationId)
      validatePassword(password)
      return verifyReceipt(
        await port.initialize(operationId, password),
        original(operationId, 'initialize'),
      )
    },
    unlock(password: string) {
      validatePassword(password, false)
      return port.unlock(password)
    },
    lock: () => port.lock(),
    async changePassword(operationId: string, oldPassword: string, newPassword: string) {
      uuid(operationId)
      validatePassword(oldPassword, false)
      validatePassword(newPassword)
      return verifyReceipt(
        await port.changePassword(operationId, oldPassword, newPassword),
        original(operationId, 'password_change'),
      )
    },
    async list(query: DirectoryQuery<keyof Entry> = {}) {
      if (query.fields && !query.fields.includes('id'))
        throw new Error('Archive projections require entry identity')
      const result = await port.list(query)
      if (result.tenantId !== tenant) throw new Error('Wrong archive directory tenant')
      return result
    },
    async entry(id: string) {
      const result = await port.entry(uuid(id))
      if (
        result.id !== id ||
        result.latest.entryId !== id ||
        positive(result.revision) < positive(result.latest.version)
      )
        throw new Error('Wrong archive entry detail')
      return result
    },
    async history(entryId: string, query: WindowQuery = {}) {
      const result = await port.history(uuid(entryId), query)
      if (result.items.some((item) => item.entryId !== entryId))
        throw new Error('Wrong archive version history')
      return result
    },
    async import(input: ImportIntent, materials: readonly ImportMaterial[]) {
      validateImport(input, materials)
      const intent = freeze({
        operationId: input.operationId,
        entryId: input.entryId,
        expectedRevision: input.expectedRevision,
        metadata: input.metadata,
        files: input.files.map((file) => ({ name: file.name, format: file.format })),
        requestVersion: input.requestVersion && {
          entryId: input.requestVersion.entryId,
          version: input.requestVersion.version,
        },
      })
      return verifyReceipt(
        await port.import(intent, materials),
        original(
          intent.operationId,
          'import',
          intent.entryId,
          intent.expectedRevision + 1,
          intent.expectedRevision,
        ),
      )
    },
    async generate(input: GenerateIntent) {
      validateGeneration(input)
      const intent = freeze(input)
      return verifyReceipt(
        await port.generate(intent),
        original(
          intent.operationId,
          'generate',
          intent.entryId,
          intent.expectedRevision + 1,
          intent.expectedRevision,
        ),
      )
    },
    async metadata(input: MetadataIntent) {
      uuid(input.operationId)
      uuid(input.entryId)
      positive(input.expectedRevision)
      validateMetadata(input.metadata)
      const intent = freeze(input)
      return verifyReceipt(
        await port.metadata(intent),
        original(
          intent.operationId,
          'metadata',
          intent.entryId,
          intent.expectedRevision + 1,
          intent.expectedRevision,
        ),
      )
    },
    async manage(input: ManageIntent) {
      uuid(input.operationId)
      uuid(input.entryId)
      positive(input.expectedRevision)
      if (typeof input.retired !== 'boolean') throw new Error('Invalid retirement selection')
      if (input.recommendedVersion !== null) positive(input.recommendedVersion)
      const intent = freeze(input)
      return verifyReceipt(
        await port.manage(intent),
        original(intent.operationId, 'manage', intent.entryId, null, intent.expectedRevision),
      )
    },
    async export(input: ExportIntent, signal?: AbortSignal) {
      uuid(input.operationId)
      validateReference(input)
      const result = await port.export(freeze(input), signal)
      try {
        if (signal?.aborted) throw new Error('Certificate export cancelled')
        if (
          !result.length ||
          result.length > 48 ||
          new Set(result.map((file) => file.name)).size !== result.length
        )
          throw new Error('Invalid export file set')
        let bytes = 0
        for (const file of result) {
          filename(file.name, 256)
          bytes += file.bytes.byteLength
          if (!file.bytes.byteLength) throw new Error('Empty export file')
        }
        if (bytes > 4 * 1024 * 1024) throw new Error('Archive export exceeds budget')
        return result
      } catch (error) {
        result.forEach((file) => new Uint8Array(file.bytes).fill(0))
        throw error
      }
    },
    async operation(input: OriginalOperation) {
      validateOriginal(input)
      const expected = freeze(input)
      return verifyReceipt(await port.operation(expected.operationId), expected)
    },
    settings: () => port.settings(),
    async saveSettings(input: SettingsIntent) {
      uuid(input.operationId)
      revision(input.expectedRevision)
      validateSettings(input.value)
      const intent = freeze(input)
      return verifyReceipt(
        await port.saveSettings(intent),
        original(intent.operationId, 'settings', null, null, intent.expectedRevision),
      )
    },
  })
}
export type CertificateArchive = ReturnType<typeof createCertificateArchive>
