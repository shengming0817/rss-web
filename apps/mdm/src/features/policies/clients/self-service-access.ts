import {
  array,
  closed,
  enumeration,
  record,
  unique,
  uuid,
  identifier,
} from '../../../services/decode'
import { source } from '../../operations/clients/authorization'
export const selectorKinds = ['user', 'idp_group', 'department', 'user_group'] as const
/** Policy selector coordinates, independent of management grants and membership evaluation. */
export function selfServiceSelector(value: unknown) {
  const kind = enumeration(record(value)['kind'], selectorKinds)
  if (kind === 'user') {
    const v = closed(value, ['kind', 'instanceId', 'tenantId', 'principalId'])
    return {
      kind,
      instanceId: uuid(v['instanceId']),
      tenantId: uuid(v['tenantId']),
      principalId: uuid(v['principalId']),
    }
  }
  if (kind === 'user_group') return { kind, id: uuid(closed(value, ['kind', 'id'])['id']) }
  const v = closed(
    value,
    kind === 'department' ? ['kind', 'source', 'id', 'matching'] : ['kind', 'source', 'id'],
  )
  const common = { source: source(v['source']), id: identifier(v['id']) }
  return kind === 'department'
    ? { kind, ...common, matching: enumeration(v['matching'], ['exact', 'subtree'] as const) }
    : { kind, ...common }
}
export type SelfServiceSelector = ReturnType<typeof selfServiceSelector>
export function selfServiceAccess(value: unknown) {
  const kind = enumeration(record(value)['kind'], [
    'device',
    'authenticated_user',
    'users',
  ] as const)
  if (kind !== 'users') {
    closed(value, ['kind'])
    return { kind }
  }
  const v = closed(value, ['kind', 'selectors']),
    selectors = unique(array(v['selectors'], selfServiceSelector), (s) => JSON.stringify(s))
  if (!selectors.length || selectors.length > 256) throw new Error('Invalid self-service selection')
  return { kind, selectors }
}
export type SelfServiceAccess = ReturnType<typeof selfServiceAccess>
