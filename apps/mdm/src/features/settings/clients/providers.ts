import { operationReceipt, positive } from './value'
import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  nullable,
  uuid,
  string,
  unique,
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
function directory<T extends { revision: number }>(
  value: unknown,
  selected: 'desiredRevision' | 'selectedRevision',
  decode: (v: unknown) => T,
) {
  const v = closed(value, ['revision', selected, 'versions'])
  return {
    revision: count(v['revision']),
    desiredRevision: nullable(v[selected], positive),
    versions: unique(array(v['versions'], decode), (v) => v.revision),
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
      transport.request({
        method: 'GET',
        path: '/api/v1/storage/connections',
        successStatus: 200,
        decode: (v) => directory(v, 'desiredRevision', storageReceipt),
      }),
    operation: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/storage/connections/operations/{id}',
        pathParams: { id: uuid(id) },
        successStatus: 200,
        decode: operationReceipt(id, storageReceipt),
      }),
    save: (id: string, body: StorageInput) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/storage/connections',
        headers: { 'Idempotency-Key': uuid(id) },
        body,
        successStatus: 202,
        decode(v) {
          const r = storageReceipt(v)
          if (r.operationId !== id) throw new Error('Wrong operation')
          return r
        },
      }),
  }
}
export function createMailClient(transport: HttpTransport) {
  return {
    read: () =>
      transport.request({
        method: 'GET',
        path: '/api/v1/smtp',
        successStatus: 200,
        decode: (v) => directory(v, 'selectedRevision', mailReceipt),
      }),
    operation: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/smtp/operations/{id}',
        pathParams: { id: uuid(id) },
        successStatus: 200,
        decode: operationReceipt(id, mailReceipt),
      }),
    save: (id: string, body: MailInput) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/smtp',
        headers: { 'Idempotency-Key': uuid(id) },
        body,
        successStatus: 202,
        decode(v) {
          const r = mailReceipt(v)
          if (r.operationId !== id) throw new Error('Wrong operation')
          return r
        },
      }),
  }
}
export function createWnsClient(transport: HttpTransport) {
  return {
    read: () =>
      transport.request({
        method: 'GET',
        path: '/api/v1/windows/wns',
        successStatus: 200,
        decode: (v) => directory(v, 'desiredRevision', wnsReceipt),
      }),
    operation: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/windows/wns/operations/{id}',
        pathParams: { id: uuid(id) },
        successStatus: 200,
        decode(value) {
          const result = wnsOperation(value)
          if (result.receipt.operationId !== id) throw new Error('Wrong original operation')
          return result
        },
      }),
    save: (id: string, body: WnsInput) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/windows/wns',
        headers: { 'Idempotency-Key': uuid(id) },
        body,
        successStatus: 202,
        decode(value) {
          const result = wnsOperation(value)
          if (result.receipt.operationId !== id) throw new Error('Wrong original operation')
          return result
        },
      }),
    revoke: (id: string, body: { expectedRevision: number; materialRevision: number }) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/windows/wns/revoke',
        headers: { 'Idempotency-Key': uuid(id) },
        body,
        successStatus: 202,
        decode(value) {
          const result = wnsOperation(value)
          if (result.receipt.operationId !== id) throw new Error('Wrong original operation')
          return result
        },
      }),
  }
}
