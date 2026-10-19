import { operationReceipt, positive, sha256 } from './value'
import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  boolean,
  closed,
  count,
  nullable,
  record,
  string,
  unique,
  uuid,
} from '../../../services/decode'
export function webhookMaterial(value: unknown) {
  const v = closed(value, [
    'operationId',
    'reference',
    'revision',
    'configurationSha256',
    'keyDigest',
    'challenge',
    'confirmed',
    'revoked',
    'endpoint',
    'networkReference',
    'attemptedAt',
    'confirmedAt',
    'failureReason',
  ])
  return {
    operationId: uuid(v['operationId']),
    reference: string(v['reference']),
    revision: positive(v['revision']),
    configurationSha256: sha256(v['configurationSha256']),
    keyDigest: sha256(v['keyDigest']),
    challenge: string(v['challenge']),
    confirmed: boolean(v['confirmed']),
    revoked: boolean(v['revoked']),
    endpoint: nullable(v['endpoint'], string),
    networkReference: nullable(v['networkReference'], string),
    attemptedAt: nullable(v['attemptedAt'], count),
    confirmedAt: nullable(v['confirmedAt'], count),
    failureReason: nullable(v['failureReason'], string),
  }
}
export function webhookHead(value: unknown) {
  const v = closed(value, ['reference', 'revision', 'activeRevision', 'retiringRevision'])
  return {
    reference: string(v['reference']),
    revision: positive(v['revision']),
    activeRevision: nullable(v['activeRevision'], positive),
    retiringRevision: nullable(v['retiringRevision'], positive),
  }
}
export function webhookOperation(value: unknown) {
  if ('configurationSha256' in record(value)) return webhookMaterial(value)
  const v = closed(value, [
    'operationId',
    'reference',
    'revision',
    'activeRevision',
    'retiringRevision',
  ])
  return {
    operationId: uuid(v['operationId']),
    ...webhookHead({
      reference: v['reference'],
      revision: v['revision'],
      activeRevision: v['activeRevision'],
      retiringRevision: v['retiringRevision'],
    }),
  }
}
export interface WebhookInput {
  reference: string
  expectedRevision: number
  configurationSha256: string
  endpoint: string
  networkReference: string
  source: { kind: 'generate' } | { kind: 'import'; secret: string }
}
export interface WebhookTransition {
  reference: string
  expectedRevision: number
  action: { kind: 'activate' | 'revoke'; materialRevision: number } | { kind: 'retire_previous' }
}
export function createWebhookMaterials(transport: HttpTransport) {
  return {
    read: () =>
      transport.request({
        method: 'GET',
        path: '/api/v1/webhooks/materials',
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['configurationSha256', 'keys']),
            keys = closed(v['keys'], ['heads', 'materials'])
          return {
            configurationSha256: sha256(v['configurationSha256']),
            heads: unique(array(keys['heads'], webhookHead), (v) => v.reference),
            materials: array(keys['materials'], webhookMaterial),
          }
        },
      }),
    operation: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/webhooks/materials/operations/{id}',
        pathParams: { id: uuid(id) },
        successStatus: 200,
        decode: operationReceipt(id, webhookOperation),
      }),
    prepare: (id: string, body: WebhookInput) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/webhooks/materials',
        headers: { 'Idempotency-Key': uuid(id) },
        body,
        successStatus: 200,
        decode: operationReceipt(id, webhookMaterial),
      }),
    transition: (id: string, body: WebhookTransition) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/webhooks/materials/transitions',
        headers: { 'Idempotency-Key': uuid(id) },
        body,
        successStatus: 200,
        decode: operationReceipt(id, webhookOperation),
      }),
  }
}
