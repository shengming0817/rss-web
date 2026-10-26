import {
  array,
  closed,
  count,
  enumeration,
  identifier,
  nullable,
  string,
  uuid,
} from '../../../services/decode'
import { jsonValue } from '../../../services/json'
import { policyName } from './model'
export type CapabilitySelector =
  | { kind: 'id'; id: string }
  | { kind: 'tool_name'; name: string }
  | { kind: 'alias'; alias: string }
export function toolName(value: unknown) {
  const name = string(value)
  if (!/^policy_[0-9a-f]{32}$/.test(name) || /^policy_0{32}$/.test(name))
    throw new Error('Invalid tool name')
  return name
}
export function decodeSelector(value: CapabilitySelector): CapabilitySelector {
  if (value.kind === 'id') {
    const v = closed(value, ['kind', 'id'])
    return { kind: 'id', id: uuid(v['id']) }
  }
  if (value.kind === 'tool_name') {
    const v = closed(value, ['kind', 'name'])
    return { kind: 'tool_name', name: toolName(v['name']) }
  }
  const v = closed(value, ['kind', 'alias'])
  if (v['kind'] !== 'alias') throw new Error('Invalid selector')
  return { kind: 'alias', alias: policyName(v['alias']) }
}
export function decodeCapability(value: unknown) {
  const v = closed(value, [
    'id',
    'objectType',
    'toolName',
    'alias',
    'scope',
    'instance',
    'tenant',
    'revision',
    'version',
    'operations',
    'inputSchema',
    'outputSchema',
  ])
  const id = uuid(v['id']),
    name = toolName(v['toolName'])
  if (name !== `policy_${id.replaceAll('-', '')}`) throw new Error('Wrong tool identity')
  return {
    id,
    objectType: enumeration(v['objectType'], ['policy'] as const),
    toolName: name,
    alias: nullable(v['alias'], policyName),
    scope: uuid(v['scope']),
    instance: identifier(v['instance']),
    tenant: uuid(v['tenant']),
    revision: count(v['revision']),
    version: uuid(v['version']),
    operations: array(v['operations'], (v) => enumeration(v, ['read'] as const)),
    inputSchema: jsonValue(v['inputSchema'], 65536),
    outputSchema: jsonValue(v['outputSchema'], 65536),
  }
}
