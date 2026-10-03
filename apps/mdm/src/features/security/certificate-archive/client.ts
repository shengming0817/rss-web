import type { HttpTransport } from '@rss/api/mdm'
import { array, boolean, closed } from '../../../services/decode'
import {
  page,
  vault,
  settings,
  receipt,
  version,
  exported,
  type ImportInput,
  type GenerateInput,
  type Reference,
} from './model'
const base = '/api/v1/certificate-archive'
export function createCertificateArchiveClient(transport: HttpTransport, tenant: string) {
  function write<T>(
    path: string,
    operation: string,
    body: unknown,
    decode: (v: unknown) => T,
    method: 'POST' | 'PUT' = 'POST',
  ) {
    return transport.request({
      method,
      path: base + path,
      headers: { 'Idempotency-Key': operation },
      body,
      successStatus: 200,
      decode,
    })
  }
  return {
    state: () =>
      transport.request({
        method: 'GET',
        path: base + '/vault',
        successStatus: 200,
        decode: vault,
      }),
    initialize: (operation: string, password: string) =>
      write('/vault/initialize', operation, { password }, (v) => receipt(v, operation)),
    unlock: (password: string) =>
      transport.request({
        method: 'POST',
        path: base + '/vault/unlock',
        body: { password },
        successStatus: 200,
        decode: vault,
      }),
    lock: () =>
      transport.request({
        method: 'POST',
        path: base + '/vault/lock',
        successStatus: 200,
        decode: (v) => {
          const value = closed(v, ['locked'])
          if (!boolean(value['locked'])) throw new Error('Invalid lock result')
          return true
        },
      }),
    password: (operation: string, oldPassword: string, newPassword: string) =>
      write('/vault/password', operation, { oldPassword, newPassword }, (v) =>
        receipt(v, operation),
      ),
    list: (after?: string) =>
      transport.request({
        method: 'GET',
        path: base + '/entries',
        query: { after },
        successStatus: 200,
        decode: (v) => page(v, tenant),
      }),
    history: (entry: string, before?: number) =>
      transport.request({
        method: 'GET',
        path: base + '/entries/{entry}/versions',
        pathParams: { entry },
        query: { before },
        successStatus: 200,
        decode: (v) => {
          const result = array(v, version)
          if (
            result.some((r) => r.entryId !== entry || (before !== undefined && r.version >= before))
          )
            throw new Error('Wrong history')
          return result
        },
      }),
    import: (operation: string, input: ImportInput) =>
      write('/import', operation, input, (v) => {
        const r = receipt(v, operation)
        if (
          r.action !== 'certificate_archive_import' ||
          r.entryId !== input.entryId ||
          r.version !== input.expectedRevision + 1
        )
          throw new Error('Wrong import receipt')
        return r
      }),
    saveMetadata: (
      operation: string,
      entry: string,
      expectedRevision: number,
      metadata: ImportInput['metadata'],
    ) =>
      write(
        '/entries/' + encodeURIComponent(entry) + '/metadata',
        operation,
        { expectedRevision, metadata },
        (v) => receipt(v, operation),
        'PUT',
      ),
    generate: (operation: string, input: GenerateInput) =>
      write('/generate', operation, input, (v) => {
        const r = receipt(v, operation)
        if (
          r.action !== 'certificate_archive_generate' ||
          r.entryId !== input.entryId ||
          r.version !== input.expectedRevision + 1
        )
          throw new Error('Wrong generation receipt')
        return r
      }),
    export: (operation: string, id: Reference) =>
      write('/export', operation, id, (v) => exported(v, id)),
    operation: (id: string) =>
      transport.request({
        method: 'GET',
        path: base + '/operations/{operation}',
        pathParams: { operation: id },
        successStatus: 200,
        decode: (v) => receipt(v, id),
      }),
    settings: () =>
      transport.request({
        method: 'GET',
        path: base + '/settings',
        successStatus: 200,
        decode: settings,
      }),
    saveSettings: (
      operation: string,
      expectedRevision: number,
      value: { reminderDays: number; categories: string[] },
    ) =>
      write(
        '/settings',
        operation,
        { expectedRevision, value },
        (v) => receipt(v, operation),
        'PUT',
      ),
    manage: (
      operation: string,
      entryId: string,
      expectedRevision: number,
      retired: boolean,
      recommendedVersion: number | null,
    ) =>
      write(
        '/entries/' + encodeURIComponent(entryId),
        operation,
        { expectedRevision, retired, recommendedVersion },
        (v) => receipt(v, operation),
        'PUT',
      ),
  }
}
