import * as wireSchemas from '@rss/api/mdm-schemas'
import {
  array,
  count,
  enumeration,
  identifier,
  nullable,
  string,
  uuid,
} from '../../../services/decode'
import { jsonValue } from '../../../services/json'
import { policyName } from './model'
export type CapabilitySelector = wireSchemas.postApiV1PoliciesResolveBody.Root
export function toolName(value: unknown) {
  const name = string(value)
  if (!/^policy_[0-9a-f]{32}$/.test(name) || /^policy_0{32}$/.test(name))
    throw new Error('Invalid tool name')
  return name
}
export function decodeSelector(value: CapabilitySelector): CapabilitySelector {
  const normalized = value.kind === 'alias' ? { ...value, alias: policyName(value.alias) } : value
  if (!wireSchemas.postApiV1PoliciesResolveBody.validateRoot(normalized))
    throw new Error('Invalid selector')
  if (normalized.kind === 'id') uuid(normalized.id)
  if (normalized.kind === 'tool_name') toolName(normalized.name)
  return normalized
}
export function decodeCapability(value: unknown) {
  if (!wireSchemas.postApiV1PoliciesResolveResponse.validateCapabilityDescriptor(value))
    throw new Error('Invalid contract value')

  const v = value
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
