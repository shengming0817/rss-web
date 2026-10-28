import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import { operationReceipt, positive, sha256 } from './value'
import type { HttpTransport } from '@rss/api/mdm'
import { array, count, nullable, string, unique, uuid } from '../../../services/decode'
export function webhookMaterial(value: unknown) {
  if (!wireSchemas.postApiV1WebhooksMaterialsResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    operationId: uuid(v['operationId']),
    reference: string(v['reference']),
    revision: positive(v['revision']),
    configurationSha256: sha256(v['configurationSha256']),
    keyDigest: sha256(v['keyDigest']),
    challenge: string(v['challenge']),
    confirmed: v['confirmed'],
    revoked: v['revoked'],
    endpoint: nullable(v['endpoint'], string),
    networkReference: nullable(v['networkReference'], string),
    attemptedAt: nullable(v['attemptedAt'], count),
    confirmedAt: nullable(v['confirmedAt'], count),
    failureReason: nullable(v['failureReason'], string),
  }
}
export function webhookHead(value: unknown) {
  if (!wireSchemas.getApiV1WebhooksMaterialsResponse.validateHead(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    reference: string(v['reference']),
    revision: positive(v['revision']),
    activeRevision: nullable(v['activeRevision'], positive),
    retiringRevision: nullable(v['retiringRevision'], positive),
  }
}
export function webhookOperation(value: unknown) {
  if (!wireSchemas.getApiV1WebhooksMaterialsOperationsByIdResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  if ('configurationSha256' in value) return webhookMaterial(value)
  const v = value
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
      api.getApiV1WebhooksMaterials(transport, {}, (value) => {
        const v = value,
          keys = v['keys']
        return {
          configurationSha256: sha256(v['configurationSha256']),
          heads: unique(array(keys['heads'], webhookHead), (v) => v.reference),
          materials: array(keys['materials'], webhookMaterial),
        }
      }),
    operation: (id: string) =>
      api.getApiV1WebhooksMaterialsOperationsById(
        transport,
        { pathParams: { id: uuid(id) } },
        operationReceipt(id, webhookOperation),
      ),
    prepare: (id: string, body: WebhookInput) =>
      api.postApiV1WebhooksMaterials(
        transport,
        { headers: { 'Idempotency-Key': uuid(id) }, body },
        operationReceipt(id, webhookMaterial),
      ),
    transition: (id: string, body: WebhookTransition) =>
      api.postApiV1WebhooksMaterialsTransitions(
        transport,
        { headers: { 'Idempotency-Key': uuid(id) }, body },
        operationReceipt(id, webhookOperation),
      ),
  }
}
