import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  identifier,
  nullable,
  string,
  uuid,
} from '../../../services/decode'
import type { Operation } from '../../../services/useOperation'
import { nativeSchedule, resourceBinding, softwarePolicyDefinition } from './assignment-model'
import { candidate } from './candidate'
export function selfServiceDefinition(value: unknown) {
  const v = closed(value, [
    'title',
    'description',
    'enabled',
    'resource',
    'scope',
    'admissionOperation',
    'schedule',
    'runLifetimeSeconds',
  ])
  const d = {
    title: identifier(v['title']),
    description: string(v['description']),
    enabled: boolean(v['enabled']),
    resource: resourceBinding(v['resource']),
    scope: uuid(v['scope']),
    admissionOperation: uuid(v['admissionOperation']),
    schedule: nativeSchedule(v['schedule']),
    runLifetimeSeconds: count(v['runLifetimeSeconds']),
  }
  softwarePolicyDefinition({
    resource: d.resource,
    scope: d.scope,
    behavior: {
      kind: 'software',
      intent: 'available_install',
      admissionOperation: d.admissionOperation,
      schedule: d.schedule,
      runLifetimeSeconds: d.runLifetimeSeconds,
      rollout: { stages: [{ scope: d.scope, opensAt: 0, minimumVerifiedPercent: null }] },
    },
  })
  return d
}
export type SelfServiceDefinition = ReturnType<typeof selfServiceDefinition>
export function selfServiceItem(value: unknown, id?: string) {
  const v = closed(value, ['id', 'revision', 'operation', 'definition'])
  const result = {
    id: uuid(v['id']),
    revision: count(v['revision']),
    operation: uuid(v['operation']),
    definition: selfServiceDefinition(v['definition']),
  }
  if (id && result.id !== id) throw new Error('Wrong self-service item')
  return result
}
export type SelfServiceItem = ReturnType<typeof selfServiceItem>
export const requestPhases = ['pending', 'approved', 'denied', 'cancelled'] as const
export type RequestPhase = (typeof requestPhases)[number]
export function installationRequest(value: unknown, id?: string) {
  const v = closed(value, [
    'id',
    'revision',
    'operation',
    'requester',
    'device',
    'createdAt',
    'item',
    'phase',
    'decisions',
    'policy',
    'execution',
  ])
  const i = closed(v['item'], ['id', 'revision', 'title', 'resource'])
  const result = {
    id: uuid(v['id']),
    revision: count(v['revision']),
    operation: uuid(v['operation']),
    requester: identifier(v['requester']),
    device: identifier(v['device']),
    createdAt: count(v['createdAt']),
    item: {
      id: uuid(i['id']),
      revision: count(i['revision']),
      title: identifier(i['title']),
      resource: resourceBinding(i['resource']),
    },
    phase: enumeration(v['phase'], requestPhases),
    decisions: array(v['decisions'], (value) => {
      const d = closed(value, ['action', 'actor', 'at', 'note'])
      return {
        action: enumeration(d['action'], ['approve', 'deny', 'cancel'] as const),
        actor: identifier(d['actor']),
        at: count(d['at']),
        note: identifier(d['note']),
      }
    }),
    policy: nullable(v['policy'], (value) => {
      const p = closed(value, ['id', 'versionId'])
      return { id: uuid(p['id']), versionId: uuid(p['versionId']) }
    }),
    execution: nullable(v['execution'], uuid),
  }
  if (
    (id && result.id !== id) ||
    (result.phase === 'approved' && !result.policy) ||
    (result.execution && !result.policy) ||
    (['pending', 'denied'].includes(result.phase) && result.policy)
  )
    throw new Error('Invalid software request')
  return result
}
export type InstallationRequest = ReturnType<typeof installationRequest>
export type RequestChange = { action: 'approve' | 'deny' | 'cancel'; note: string }
export type SelfServiceChange = { action: 'put'; definition: SelfServiceDefinition }
export function createSelfServiceClient(transport: HttpTransport, tenant: string, demo: boolean) {
  const envelope = (v: unknown, keys: string[]) => candidate(v, tenant, demo, keys)
  const page = <T>(v: unknown, decode: (v: unknown) => T) => {
    const p = envelope(v, ['snapshot', 'items', 'nextCursor'])
    return {
      snapshot: uuid(p['snapshot']),
      items: array(p['items'], decode),
      nextCursor: nullable(p['nextCursor'], string),
    }
  }
  return {
    items: (cursor?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/software/self-service/items',
        query: { cursor, limit: 20 },
        successStatus: 200,
        decode: (v) => page(v, selfServiceItem),
      }),
    item: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/software/self-service/items/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => selfServiceItem(envelope(v, ['item'])['item'], id),
      }),
    changeItem: (id: string, body: Operation<SelfServiceChange>) =>
      transport.request({
        method: 'POST',
        path: '/api/mdm-candidate/v1/software/self-service/items/{id}',
        pathParams: { id },
        body,
        successStatus: 200,
        decode: (v) => {
          const item = selfServiceItem(envelope(v, ['item'])['item'], id)
          if (item.operation !== body.operationId) throw new Error('Wrong item receipt')
          return item
        },
      }),
    requests: (phase?: RequestPhase, cursor?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/software/self-service/requests',
        query: { phase, cursor, limit: 20 },
        successStatus: 200,
        decode: (v) => page(v, installationRequest),
      }),
    request: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/mdm-candidate/v1/software/self-service/requests/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => installationRequest(envelope(v, ['request'])['request'], id),
      }),
    decide: (id: string, body: Operation<RequestChange>) =>
      transport.request({
        method: 'POST',
        path: '/api/mdm-candidate/v1/software/self-service/requests/{id}',
        pathParams: { id },
        body,
        successStatus: 200,
        decode: (v) => {
          const r = installationRequest(envelope(v, ['request'])['request'], id)
          if (r.operation !== body.operationId) throw new Error('Wrong request receipt')
          return r
        },
      }),
  }
}
