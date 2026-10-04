import type { HttpTransport } from '@rss/api/mdm'
import { array, count, identifier, nullable, string, unique, uuid } from '../../../services/decode'
import { positive, boundedText } from './compliance-model'
import { candidate } from './candidate'
import { material, type MaterialKind } from './materials-model'
import type { SecurityRequestTarget } from './requests-model'
export type MaterialAccessTarget = Extract<SecurityRequestTarget, { kind: 'material_access' }>
export interface DisclosureBinding {
  principal: string
  sessionId: string
}
export interface DisclosureRequest {
  disclosureId: string
  request: string
  expectedRevision: number
}
export function createMaterialsClient(transport: HttpTransport, tenant: string, demo: boolean) {
  function entry(value: unknown, device: string, kind?: MaterialKind) {
    const result = material(value)
    if (result.device !== device || (kind && result.kind !== kind))
      throw new Error('Wrong material')
    return result
  }
  return {
    list: (device: string, cursor?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/mdm-candidate/security/materials/{device}',
        pathParams: { device },
        query: { limit: 20, cursor },
        successStatus: 200,
        decode(value) {
          const v = candidate(value, tenant, demo, ['items', 'snapshot', 'nextCursor', 'asOf'])
          return {
            items: unique(
              array(v['items'], (value) => entry(value, device)),
              (v) => v.kind,
            ),
            snapshot: uuid(v['snapshot']),
            nextCursor: nullable(v['nextCursor'], string),
            asOf: count(v['asOf']),
          }
        },
      }),
    read: (device: string, kind: MaterialKind) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/mdm-candidate/security/materials/{device}/{kind}',
        pathParams: { device, kind },
        successStatus: 200,
        decode(value) {
          const v = candidate(value, tenant, demo, ['material', 'asOf'])
          return { material: entry(v['material'], device, kind), asOf: count(v['asOf']) }
        },
      }),
    /** One-time response only. Never use Operation receipts or a shared query cache here. */
    reveal: (target: MaterialAccessTarget, body: DisclosureRequest, binding: DisclosureBinding) =>
      transport.request({
        method: 'POST',
        path: '/api/v1/mdm-candidate/security/materials/{device}/{kind}/reveal',
        pathParams: { device: target.device, kind: target.material },
        body,
        successStatus: 200,
        decode(value) {
          const v = candidate(value, tenant, demo, [
              'disclosureId',
              'request',
              'device',
              'material',
              'materialRevision',
              'volume',
              'principal',
              'sessionId',
              'issuedAt',
              'expiresAt',
              'secret',
            ]),
            issuedAt = count(v['issuedAt']),
            expiresAt = count(v['expiresAt'])
          if (
            uuid(v['disclosureId']) !== body.disclosureId ||
            uuid(v['request']) !== body.request ||
            identifier(v['device']) !== target.device ||
            v['material'] !== target.material ||
            positive(v['materialRevision']) !== target.materialRevision ||
            nullable(v['volume'], identifier) !== target.volume ||
            uuid(v['principal']) !== binding.principal ||
            uuid(v['sessionId']) !== binding.sessionId ||
            expiresAt <= issuedAt ||
            expiresAt - issuedAt > 30
          )
            throw new Error('Invalid disclosure binding')
          return {
            disclosureId: body.disclosureId,
            issuedAt,
            expiresAt,
            secret: boundedText(v['secret'], 1024),
          }
        },
      }),
  }
}
