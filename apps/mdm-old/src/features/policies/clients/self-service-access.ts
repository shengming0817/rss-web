import * as wireSchemas from '@rss/api/mdm-schemas'
import { wireValue } from '../../../contracts/collection/check'
import { source } from '../../operations/clients/authorization'
import { array, unique } from '../../../services/decode'

export const selectorKinds = ['user', 'idp_group', 'department', 'user_group'] as const
/** Policy selector coordinates, independent of management grants and membership evaluation. */
export function selfServiceSelector(input: unknown) {
  const value = wireValue(input)
  if (!wireSchemas.getApiV1PoliciesByIdResponse.validateSelfServiceSelector(value))
    throw new Error('Invalid selector')
  if ('source' in value) source(value.source)
  return value
}
export type SelfServiceSelector = ReturnType<typeof selfServiceSelector>
export function selfServiceAccess(value: unknown) {
  if (!wireSchemas.getApiV1PoliciesByIdResponse.validateSelfServiceAccess(value))
    throw new Error('Invalid contract value')

  const kind = value['kind']
  if (kind !== 'users') {
    return { kind }
  }
  const v = value,
    selectors = unique(array(v['selectors'], selfServiceSelector), (s) => JSON.stringify(s))
  if (!selectors.length || selectors.length > 256) throw new Error('Invalid self-service selection')
  return { kind, selectors }
}
export type SelfServiceAccess = ReturnType<typeof selfServiceAccess>
