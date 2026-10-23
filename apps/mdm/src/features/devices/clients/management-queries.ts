import type { HttpTransport } from '@rss/api/mdm'
import { array, boolean, closed, count, enumeration, identifier, integer, nullable, string, uuid } from '../../../services/decode'
import { jsonObject } from '../../../services/json'
import { objectRef } from './objects'
import { decodeNativeObservation } from '../../policies/clients/native'
export function memberships(value: unknown) {
  const v = closed(value, ['items', 'nextCursor', 'associationCurrent'])
  return { associationCurrent: boolean(v['associationCurrent']), nextCursor: nullable(v['nextCursor'], string), items: array(v['items'], value => {
    const i = closed(value, ['id', 'presentation', 'kind', 'assetContext', 'revision', 'memberVersion', 'calculationRevision', 'memberSet', 'currentRuleVersion', 'evaluatedRuleVersion', 'inputVersion', 'asOf', 'ruleCurrent', 'objects', 'associationCurrent', 'inputCurrent', 'evaluation'])
    return { id: uuid(i['id']), presentation: jsonObject(i['presentation'], 65536), kind: enumeration(i['kind'], ['static', 'smart'] as const), assetContext: identifier(i['assetContext']), revision: count(i['revision']), memberVersion: count(i['memberVersion']), calculationRevision: count(i['calculationRevision']), memberSet: uuid(i['memberSet']), currentRuleVersion: nullable(i['currentRuleVersion'], count), evaluatedRuleVersion: nullable(i['evaluatedRuleVersion'], count), inputVersion: string(i['inputVersion']), asOf: integer(i['asOf']), ruleCurrent: boolean(i['ruleCurrent']), objects: array(i['objects'], objectRef), associationCurrent: nullable(i['associationCurrent'], boolean), inputCurrent: boolean(i['inputCurrent']), evaluation: enumeration(i['evaluation'], ['current', 'stale'] as const) }
  }) }
}
export function ddmPage(value: unknown) {
  const v = closed(value, ['items', 'nextCursor', 'availability', 'effect', 'compliance'])
  return { nextCursor: nullable(v['nextCursor'], string), availability: enumeration(v['availability'], ['current_registration', 'no_current_registration'] as const), effect: enumeration(v['effect'], ['unverified'] as const), compliance: enumeration(v['compliance'], ['unknown'] as const), items: array(v['items'], value => { const i = closed(value, ['operationId', 'registrationId', 'generation', 'channel', 'userKey', 'nativeValuesRedacted', 'observation']); return { operationId: uuid(i['operationId']), registrationId: uuid(i['registrationId']), generation: count(i['generation']), channel: enumeration(i['channel'], ['mdm.apple'] as const), userKey: string(i['userKey']), nativeValuesRedacted: boolean(i['nativeValuesRedacted']), observation: decodeNativeObservation(i['observation']) } }) }
}
export function createManagementQueries(transport: HttpTransport) {
  return {
    groups: (device: string, cursor?: string) => transport.request({ method: 'GET', path: '/api/v1/devices/{device}/groups', pathParams: { device }, query: { cursor, limit: 20 }, successStatus: 200, decode: memberships }),
    ddm: (device: string, cursor?: string) => transport.request({ method: 'GET', path: '/api/v1/devices/{device}/ddm', pathParams: { device }, query: { cursor, limit: 16 }, successStatus: 200, decode: ddmPage }),
  }
}
