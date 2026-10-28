import * as api from '@rss/api/mdm-operations'
import {
  queryParameters,
  windowParameters,
  windowPage,
  type DirectoryQuery,
} from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'

import {
  type entryFields,
  page,
  entry,
  vault,
  settings,
  receipt,
  version,
  exported,
  type ImportInput,
  type GenerateInput,
  type Reference,
} from './model'
export function createCertificateArchiveClient(transport: HttpTransport, tenant: string) {
  return {
    state: () => api.getApiV1CertificateArchiveVault(transport, {}, vault),
    initialize: (operation: string, password: string) =>
      api.postApiV1CertificateArchiveVaultInitialize(
        transport,
        { headers: { 'Idempotency-Key': operation }, body: { password } },
        (v) => receipt(v, operation),
      ),
    unlock: (password: string) =>
      api.postApiV1CertificateArchiveVaultUnlock(transport, { body: { password } }, vault),
    lock: () =>
      api.postApiV1CertificateArchiveVaultLock(transport, {}, (v) => {
        const value = v
        if (!value['locked']) throw new Error('Invalid lock result')
        return true
      }),
    password: (operation: string, oldPassword: string, newPassword: string) =>
      api.postApiV1CertificateArchiveVaultPassword(
        transport,
        { headers: { 'Idempotency-Key': operation }, body: { oldPassword, newPassword } },
        (v) => receipt(v, operation),
      ),
    list: <F extends keyof typeof entryFields = keyof typeof entryFields>(
      query: DirectoryQuery<F> = {},
    ) =>
      api.getApiV1CertificateArchiveEntries(
        transport,
        { query: queryParameters({ limit: 50, ...query }) },
        (v) => page(v, tenant, query.fields),
      ),
    read: (id: string) =>
      api.getApiV1CertificateArchiveEntriesByEntry(
        transport,
        { pathParams: { entry: id } },
        (value) => {
          const row = entry(value)
          if (row.id !== id) throw new Error('Wrong entry')
          return row
        },
      ),
    history: (entry: string, query: { limit?: number; cursor?: string } = {}) =>
      api.getApiV1CertificateArchiveEntriesByEntryVersions(
        transport,
        { pathParams: { entry }, query: windowParameters({ limit: 50, ...query }) },
        (v) => {
          const result = windowPage(v, version)
          if (result.items.some((r) => r.entryId !== entry)) throw new Error('Wrong history')
          return result
        },
      ),
    import: (operation: string, input: ImportInput) =>
      api.postApiV1CertificateArchiveImport(
        transport,
        { headers: { 'Idempotency-Key': operation }, body: input },
        (v) => {
          const r = receipt(v, operation)
          if (
            r.action !== 'certificate_archive_import' ||
            r.entryId !== input.entryId ||
            r.version !== input.expectedRevision + 1
          )
            throw new Error('Wrong import receipt')
          return r
        },
      ),
    saveMetadata: (
      operation: string,
      entry: string,
      expectedRevision: number,
      metadata: ImportInput['metadata'],
    ) =>
      api.putApiV1CertificateArchiveEntriesByEntryMetadata(
        transport,
        {
          pathParams: { entry },
          headers: { 'Idempotency-Key': operation },
          body: { expectedRevision, metadata },
        },
        (v) => receipt(v, operation),
      ),
    generate: (operation: string, input: GenerateInput) =>
      api.postApiV1CertificateArchiveGenerate(
        transport,
        { headers: { 'Idempotency-Key': operation }, body: input },
        (v) => {
          const r = receipt(v, operation)
          if (
            r.action !== 'certificate_archive_generate' ||
            r.entryId !== input.entryId ||
            r.version !== input.expectedRevision + 1
          )
            throw new Error('Wrong generation receipt')
          return r
        },
      ),
    export: (operation: string, id: Reference) =>
      api.postApiV1CertificateArchiveExport(
        transport,
        { headers: { 'Idempotency-Key': operation }, body: id },
        (v) => exported(v, id),
      ),
    operation: (id: string) =>
      api.getApiV1CertificateArchiveOperationsByOperation(
        transport,
        { pathParams: { operation: id } },
        (v) => receipt(v, id),
      ),
    settings: () => api.getApiV1CertificateArchiveSettings(transport, {}, settings),
    saveSettings: (
      operation: string,
      expectedRevision: number,
      value: { reminderDays: number; categories: string[] },
    ) =>
      api.putApiV1CertificateArchiveSettings(
        transport,
        { headers: { 'Idempotency-Key': operation }, body: { expectedRevision, value } },
        (v) => receipt(v, operation),
      ),
    manage: (
      operation: string,
      entryId: string,
      expectedRevision: number,
      retired: boolean,
      recommendedVersion: number | null,
    ) =>
      api.putApiV1CertificateArchiveEntriesByEntry(
        transport,
        {
          pathParams: { entry: entryId },
          headers: { 'Idempotency-Key': operation },
          body: { expectedRevision, retired, recommendedVersion },
        },
        (v) => receipt(v, operation),
      ),
  }
}
