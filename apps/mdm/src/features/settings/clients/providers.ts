import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import { windowParameters, windowPage } from '../../../services/directory-query'
import { operationReceipt, positive } from './value'
import type { HttpTransport } from '@rss/api/mdm'
import { count, enumeration, nullable, uuid, string } from '../../../services/decode'

export function storageReceipt(value: unknown) {
  if (!wireSchemas.postApiV1StorageConnectionsResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    operationId: uuid(v['operationId']),
    revision: positive(v['revision']),
    profile: string(v['profile']),
    state: enumeration(v['state'], ['pending', 'qualified', 'rejected'] as const),
    failureReason: nullable(v['failureReason'], string),
    revoked: v['revoked'],
    qualifiedAt: nullable(v['qualifiedAt'], count),
    expiresAt: nullable(v['expiresAt'], count),
  }
}
export function mailReceipt(value: unknown) {
  if (!wireSchemas.postApiV1SmtpResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    operationId: uuid(v['operationId']),
    revision: positive(v['revision']),
    profile: string(v['profile']),
    state: v['state'],
    attemptedAt: nullable(v['attemptedAt'], count),
    acceptedAt: nullable(v['acceptedAt'], count),
    failureReason: nullable(v['failureReason'], string),
  }
}
export function wnsReceipt(value: unknown) {
  if (!wireSchemas.getApiV1WindowsWnsResponse.validateReceipt(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    operationId: uuid(v['operationId']),
    revision: positive(v['revision']),
    packageFamilyName: string(v['packageFamilyName']),
    qualifiedAt: nullable(v['qualifiedAt'], count),
    attemptedAt: nullable(v['attemptedAt'], count),
    failureReason: nullable(v['failureReason'], string),
    selected: v['selected'],
    revoked: v['revoked'],
  }
}
export function wnsOperation(value: unknown) {
  if (!wireSchemas.postApiV1WindowsWnsResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value,
    kind = v['kind']
  if (kind === 'material') return { kind, receipt: wnsReceipt(v['receipt']) }
  const r = v['receipt']
  return {
    kind,
    receipt: {
      operationId: uuid(r['operationId']),
      revision: positive(r['revision']),
      materialRevision: positive(r['materialRevision']),
    },
  }
}
function providerState<T extends { revision: number }>(
  value: unknown,
  selection: 'activeRevision' | 'desiredRevision' | 'selectedRevision',
  decode: (v: unknown) => T,
) {
  if (
    !wireSchemas.getApiV1StorageConnectionsResponse.validateRoot(value) &&
    !wireSchemas.getApiV1SmtpResponse.validateRoot(value) &&
    !wireSchemas.getApiV1WindowsWnsResponse.validateRoot(value)
  )
    throw new Error('Invalid contract value')

  const v = value
  if (!(selection in v)) throw new Error('Wrong provider selection')
  return {
    revision: count(v['revision']),
    activeRevision: nullable(
      'activeRevision' in v
        ? v.activeRevision
        : 'desiredRevision' in v
          ? v.desiredRevision
          : v.selectedRevision,
      positive,
    ),
    versionCount: count(v['versionCount']),
    current: nullable(v['current'], decode),
    latest: nullable(v['latest'], decode),
    applied: 'applied' in v ? nullable(v.applied, decode) : null,
  }
}
export type StorageInput = {
  expectedRevision: number
  profile: string
  source:
    | { kind: 'generate' }
    | {
        kind: 'import'
        access_key: string
        secret_key: string
        session_token: string | null
        expires_at: number | null
      }
}
export type MailInput = {
  expectedRevision: number
  profile: string
  sender: string
  recipient: string
  username: string
  password: string
}
export type WnsInput = {
  expectedRevision: number
  packageFamilyName: string
  sid: string
  clientSecret: string
}
export function createStorageClient(transport: HttpTransport) {
  return {
    read: () =>
      api.getApiV1StorageConnections(transport, {}, (v) =>
        providerState(v, 'activeRevision', storageReceipt),
      ),
    history: (query: { limit?: number | undefined; cursor?: string | undefined } = {}) =>
      api.getApiV1StorageConnectionsVersions(
        transport,
        { query: windowParameters({ limit: 64, ...query }) },
        (v) => windowPage(v, storageReceipt),
      ),
    operation: (id: string) =>
      api.getApiV1StorageConnectionsOperationsById(
        transport,
        { pathParams: { id: uuid(id) } },
        operationReceipt(id, storageReceipt),
      ),
    save: (id: string, body: StorageInput) =>
      api.postApiV1StorageConnections(
        transport,
        { headers: { 'Idempotency-Key': uuid(id) }, body },
        (v) => {
          const r = storageReceipt(v)
          if (r.operationId !== id) throw new Error('Wrong operation')
          return r
        },
      ),
  }
}
export function createMailClient(transport: HttpTransport) {
  return {
    read: () =>
      api.getApiV1Smtp(transport, {}, (v) => providerState(v, 'selectedRevision', mailReceipt)),
    history: (query: { limit?: number | undefined; cursor?: string | undefined } = {}) =>
      api.getApiV1SmtpVersions(
        transport,
        { query: windowParameters({ limit: 64, ...query }) },
        (v) => windowPage(v, mailReceipt),
      ),
    operation: (id: string) =>
      api.getApiV1SmtpOperationsById(
        transport,
        { pathParams: { id: uuid(id) } },
        operationReceipt(id, mailReceipt),
      ),
    save: (id: string, body: MailInput) =>
      api.postApiV1Smtp(transport, { headers: { 'Idempotency-Key': uuid(id) }, body }, (v) => {
        const r = mailReceipt(v)
        if (r.operationId !== id) throw new Error('Wrong operation')
        return r
      }),
  }
}
export function createWnsClient(transport: HttpTransport) {
  return {
    read: () =>
      api.getApiV1WindowsWns(transport, {}, (v) => providerState(v, 'desiredRevision', wnsReceipt)),
    history: (query: { limit?: number | undefined; cursor?: string | undefined } = {}) =>
      api.getApiV1WindowsWnsVersions(
        transport,
        { query: windowParameters({ limit: 64, ...query }) },
        (v) => windowPage(v, wnsReceipt),
      ),
    operation: (id: string) =>
      api.getApiV1WindowsWnsOperationsById(transport, { pathParams: { id: uuid(id) } }, (value) => {
        const result = wnsOperation(value)
        if (result.receipt.operationId !== id) throw new Error('Wrong original operation')
        return result
      }),
    save: (id: string, body: WnsInput) =>
      api.postApiV1WindowsWns(
        transport,
        { headers: { 'Idempotency-Key': uuid(id) }, body },
        (value) => {
          const result = wnsOperation(value)
          if (result.receipt.operationId !== id) throw new Error('Wrong original operation')
          return result
        },
      ),
    revoke: (id: string, body: { expectedRevision: number; materialRevision: number }) =>
      api.postApiV1WindowsWnsRevoke(
        transport,
        { headers: { 'Idempotency-Key': uuid(id) }, body },
        (value) => {
          const result = wnsOperation(value)
          if (result.receipt.operationId !== id) throw new Error('Wrong original operation')
          return result
        },
      ),
  }
}
