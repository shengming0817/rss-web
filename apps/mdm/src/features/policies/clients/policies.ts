import type { HttpTransport } from '@rss/api/mdm'
import type { Operation } from '../../../services/useOperation'
import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  identifier,
  nullable,
  record,
  uuid,
} from '../../../services/decode'
import { jsonValue } from './resources'
import { candidate } from './candidate'
export function policyDefinition(value: unknown) {
  const v = closed(value, [
    'source',
    'parameters',
    'resource',
    'resourceVersion',
    'scope',
    'enabled',
    'exitBehavior',
    'trigger',
    'validity',
  ])
  const t = record(v['trigger']),
    kind = enumeration(t['kind'], ['on_change', 'interval', 'check_in'] as const)
  closed(t, kind === 'interval' ? ['kind', 'seconds'] : ['kind'])
  const seconds = kind === 'interval' ? count(t['seconds']) : null
  if (seconds !== null && (seconds < 60 || seconds > 31536000)) throw new Error('Invalid interval')
  return {
    source: enumeration(v['source'], ['resource', 'configuration'] as const),
    parameters: jsonValue(v['parameters'], 65536),
    resource: identifier(v['resource']),
    resourceVersion: identifier(v['resourceVersion']),
    scope: uuid(v['scope']),
    enabled: boolean(v['enabled']),
    exitBehavior: enumeration(v['exitBehavior'], ['cancel', 'retain'] as const),
    trigger: kind === 'interval' ? { kind, seconds: seconds! } : { kind },
    validity: nullable(v['validity'], (value) => {
      const w = closed(value, ['start', 'end']),
        start = count(w['start']),
        end = count(w['end'])
      if (end <= start) throw new Error('Invalid window')
      return { start, end }
    }),
  }
}
export type PolicyDefinition = ReturnType<typeof policyDefinition>
export type PolicyChange =
  | { action: 'put'; definition: PolicyDefinition }
  | { action: 'archive' }
  | { action: 'cancel_run'; execution: string }
export function policyMember(value: unknown) {
  const v = closed(value, ['device', 'reason', 'execution', 'cancellable'])
  return {
    device: identifier(v['device']),
    reason: enumeration(v['reason'], [
      'applicable',
      'conflict',
      'cancelling',
      'disabled',
      'offline',
      'unsupported',
      'authorization',
      'scope_unavailable',
      'resource_unavailable',
      'window',
      'trigger',
      'unknown',
    ] as const),
    execution: nullable(v['execution'], uuid),
    cancellable: boolean(v['cancellable']),
  }
}
export function decodePolicy(value: unknown, id: string) {
  const v = closed(value, ['id', 'revision', 'archived', 'definition', 'computation', 'members'])
  if (identifier(v['id']) !== id) throw new Error('Wrong policy')
  const c = closed(v['computation'], ['sequence', 'status', 'at'])
  return {
    id,
    revision: count(v['revision']),
    archived: boolean(v['archived']),
    definition: policyDefinition(v['definition']),
    computation: {
      sequence: count(c['sequence']),
      status: enumeration(c['status'], ['ready', 'waiting', 'blocked'] as const),
      at: count(c['at']),
    },
    members: array(v['members'], policyMember),
  }
}
export type PolicyRead = ReturnType<typeof decodePolicy>
export function createPoliciesClient(transport: HttpTransport, tenant: string, demo: boolean) {
  const decode = (value: unknown, id: string) =>
    decodePolicy(candidate(value, tenant, demo, ['policy'])['policy'], id)
  return {
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/policies/assignments/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => decode(v, id),
      }),
    change: (id: string, body: Operation<PolicyChange>) =>
      transport.request({
        method: 'POST',
        path: '/api/mdm-candidate/v1/policies/assignments/{id}',
        pathParams: { id },
        body,
        successStatus: 200,
        decode: (v) => decode(v, id),
      }),
    preview: (id: string, definition: PolicyDefinition) =>
      transport.request({
        method: 'POST',
        path: '/api/mdm-candidate/v1/policies/assignments/{id}/preview',
        pathParams: { id },
        body: { definition },
        successStatus: 200,
        decode(value) {
          const v = candidate(value, tenant, demo, ['members'])
          return array(v['members'], policyMember)
        },
      }),
  }
}
