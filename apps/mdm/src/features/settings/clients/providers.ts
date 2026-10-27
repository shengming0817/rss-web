import * as api from '@rss/api/mdm-operations'
import { windowParameters, windowPage } from '../../../services/directory-query'
import { operationReceipt, positive } from './value'
import type { HttpTransport } from '@rss/api/mdm'
import {
  boolean,
  closed,
  count,
  enumeration,
  nullable,
  uuid,
  string,
} from '../../../services/decode'
function receiptHead(value: unknown, keys: string[]) {
  return closed(value, ['operationId', 'revision', ...keys])
}
export function storageReceipt(value: unknown) {
  const v = receiptHead(value, [
    'profile',
    'state',
    'failureReason',
    'selected',
    'revoked',
    'qualifiedAt',
    'expiresAt',
  ])
  return {
    operationId: uuid(v['operationId']),
    revision: positive(v['revision']),
    profile: string(v['profile']),
    state: enumeration(v['state'], ['pending', 'qualified', 'rejected'] as const),
    failureReason: nullable(v['failureReason'], string),
    selected: boolean(v['selected']),
    revoked: boolean(v['revoked']),
    qualifiedAt: nullable(v['qualifiedAt'], count),
    expiresAt: nullable(v['expiresAt'], count),
  }
}
export function mailReceipt(value: unknown) {
  const v = receiptHead(value, ['profile', 'state', 'attemptedAt', 'acceptedAt', 'failureReason'])
  return {
    operationId: uuid(v['operationId']),
    revision: positive(v['revision']),
    profile: string(v['profile']),
    state: enumeration(v['state'], [
      'pending',
      'submitting',
      'accepted',
      'failed',
      'unknown',
    ] as const),
    attemptedAt: nullable(v['attemptedAt'], count),
    acceptedAt: nullable(v['acceptedAt'], count),
    failureReason: nullable(v['failureReason'], string),
  }
}
export function wnsReceipt(value: unknown) {
  const v = receiptHead(value, [
    'packageFamilyName',
    'qualifiedAt',
    'attemptedAt',
    'failureReason',
    'selected',
    'revoked',
  ])
  return {
    operationId: uuid(v['operationId']),
    revision: positive(v['revision']),
    packageFamilyName: string(v['packageFamilyName']),
    qualifiedAt: nullable(v['qualifiedAt'], count),
    attemptedAt: nullable(v['attemptedAt'], count),
    failureReason: nullable(v['failureReason'], string),
    selected: boolean(v['selected']),
    revoked: boolean(v['revoked']),
  }
}
export function wnsOperation(value: unknown) {
  const v = closed(value, ['kind', 'receipt']),
    kind = enumeration(v['kind'], ['material', 'revocation'] as const)
  if (kind === 'material') return { kind, receipt: wnsReceipt(v['receipt']) }
  const r = receiptHead(v['receipt'], ['materialRevision'])
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
  selection: 'desiredRevision' | 'selectedRevision',
  decode: (v: unknown) => T,
) {
  const keys = ['revision', selection, 'versionCount', 'current', 'latest']
  if (selection === 'desiredRevision') keys.push('applied')
  const v = closed(value, keys)
  return {
    revision: count(v['revision']),
    activeRevision: nullable(v[selection], positive),
    versionCount: count(v['versionCount']),
    current: nullable(v['current'], decode),
    latest: nullable(v['latest'], decode),
    applied: selection === 'desiredRevision' ? nullable(v['applied'], decode) : null,
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
        providerState(v, 'desiredRevision', storageReceipt),
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
