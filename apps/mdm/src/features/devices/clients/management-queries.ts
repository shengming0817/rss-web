import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  boolean,
  count,
  identifier,
  integer,
  nullable,
  string,
  uuid,
} from '../../../services/decode'
import { jsonObject } from '../../../services/json'
import { objectRef } from './objects'
import { decodeNativeObservation } from '../../policies/clients/native'
export function memberships(value: unknown) {
  if (!wireSchemas.getApiV1DevicesByDeviceGroupsResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    associationCurrent: v['associationCurrent'],
    nextCursor: nullable(v['nextCursor'], string),
    items: array(v['items'], (value) => {
      const i = value
      return {
        id: uuid(i['id']),
        presentation: jsonObject(i['presentation'], 65536),
        kind: i['kind'],
        assetContext: identifier(i['assetContext']),
        revision: count(i['revision']),
        memberVersion: count(i['memberVersion']),
        calculationRevision: count(i['calculationRevision']),
        memberSet: uuid(i['memberSet']),
        currentRuleVersion: nullable(i['currentRuleVersion'], identifier),
        evaluatedRuleVersion: nullable(i['evaluatedRuleVersion'], identifier),
        inputVersion: string(i['inputVersion']),
        asOf: integer(i['asOf']),
        ruleCurrent: i['ruleCurrent'],
        objects: array(i['objects'], objectRef),
        associationCurrent: nullable(i['associationCurrent'], boolean),
        inputCurrent: i['inputCurrent'],
        evaluation: i['evaluation'],
      }
    }),
  }
}
export function ddmPage(value: unknown) {
  if (!wireSchemas.getApiV1DevicesByDeviceDdmResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    nextCursor: nullable(v['nextCursor'], string),
    availability: v['availability'],
    effect: v['effect'],
    compliance: v['compliance'],
    items: array(v['items'], (value) => {
      const i = value
      return {
        operationId: uuid(i['operationId']),
        registrationId: uuid(i['registrationId']),
        generation: count(i['generation']),
        channel: i['channel'],
        userKey: string(i['userKey']),
        nativeValuesRedacted: i['nativeValuesRedacted'],
        observation: decodeNativeObservation(i['observation']),
      }
    }),
  }
}
export function createManagementQueries(transport: HttpTransport) {
  return {
    groups: (device: string, cursor?: string) =>
      api.getApiV1DevicesByDeviceGroups(
        transport,
        { pathParams: { device }, query: { cursor, limit: 20 } },
        memberships,
      ),
    ddm: (device: string, cursor?: string) =>
      api.getApiV1DevicesByDeviceDdm(
        transport,
        { pathParams: { device }, query: { cursor, limit: 16 } },
        ddmPage,
      ),
  }
}
