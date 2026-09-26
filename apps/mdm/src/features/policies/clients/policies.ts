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
  string,
  unique,
  uuid,
} from '../../../services/decode'
import { digest } from './resources'
export type PolicyChange =
  | { action: 'create' | 'pause' | 'resume' | 'archive' }
  | { action: 'activate'; version: number; resource: string; resourceVersion: string }
export type PolicyProjection =
  | 'targets'
  | 'add'
  | 'supersede'
  | 'retain'
  | 'cancel'
  | 'predecessors'
export function decodePolicy(value: unknown, id: string) {
  const v = closed(value, ['id', 'storageRevision', 'revision', 'status', 'plan', 'fresh'])
  if (identifier(v['id']) !== id) throw new Error('Wrong policy')
  return {
    id,
    storageRevision: count(v['storageRevision']),
    revision: count(v['revision']),
    status: enumeration(v['status'], ['draft', 'active', 'paused', 'archived'] as const),
    plan: nullable(v['plan'], identifier),
    fresh: boolean(v['fresh']),
  }
}
export type PolicyRead = ReturnType<typeof decodePolicy>
function execution(value: unknown) {
  const v = closed(value, ['device', 'version', 'progress', 'effect'])
  return {
    device: identifier(v['device']),
    version: count(v['version']),
    progress: enumeration(v['progress'], [
      'planned',
      'running',
      'unknown',
      'succeeded',
      'failed',
      'cancelled',
    ] as const),
    effect: enumeration(v['effect'], [
      'unverified',
      'unknown',
      'verified_present',
      'verified_absent',
    ] as const),
  }
}
function intent(value: unknown) {
  const kind = enumeration(record(value)['kind'], [
    'add',
    'supersede',
    'retain',
    'cancel',
    'predecessor',
  ] as const)
  if (kind === 'add' || kind === 'supersede') {
    const v = closed(value, ['kind', 'device', 'version'])
    return { kind, device: identifier(v['device']), version: count(v['version']) }
  }
  if (kind === 'predecessor') {
    const v = closed(value, ['kind', 'execution', 'successor_version'])
    return {
      kind,
      execution: execution(v['execution']),
      successor_version: count(v['successor_version']),
    }
  }
  const v = closed(value, ['kind', 'execution', 'reason'])
  return { kind, execution: execution(v['execution']), reason: identifier(v['reason']) }
}
export function decodePolicyPage(
  value: unknown,
  policy: string,
  result: string,
  projection: PolicyProjection,
) {
  const v = closed(value, [
    'result',
    'policy',
    'plan',
    'totalTargets',
    'totalExecutions',
    'page',
    'nextCursor',
  ])
  const p = closed(v['page'], ['kind', 'items'])
  if (
    v['policy'] !== policy ||
    uuid(v['result']) !== result ||
    p['kind'] !== (projection === 'targets' ? 'targets' : 'intents')
  )
    throw new Error('Wrong policy page')
  const page =
    projection === 'targets'
      ? { kind: 'targets' as const, items: unique(array(p['items'], identifier), (v) => v) }
      : {
          kind: 'intents' as const,
          items: array(p['items'], (value) => {
            const i = intent(value)
            if (i.kind !== (projection === 'predecessors' ? 'predecessor' : projection))
              throw new Error('Wrong intent projection')
            return i
          }),
        }
  return {
    result,
    policy,
    plan: identifier(v['plan']),
    totalTargets: count(v['totalTargets']),
    totalExecutions: count(v['totalExecutions']),
    page,
    nextCursor: nullable(v['nextCursor'], string),
  }
}
function admission(value: unknown, policy: string) {
  const v = closed(value, ['id', 'policy', 'devices', 'configuration', 'plan'])
  if (v['policy'] !== policy) throw new Error('Wrong execution policy')
  const p = closed(v['plan'], ['id', 'scheduling_open', 'intents', 'dispatch'])
  return {
    id: uuid(v['id']),
    policy,
    devices: unique(array(v['devices'], identifier), (v) => v),
    configuration: nullable(v['configuration'], (value) => {
      const c = closed(value, [
        'enabled',
        'policyStatus',
        'version',
        'resourceDigest',
        'ddf',
        'compiledDigest',
        'devices',
      ])
      return {
        enabled: boolean(c['enabled']),
        policyStatus: enumeration(c['policyStatus'], [
          'draft',
          'active',
          'paused',
          'archived',
        ] as const),
        version: count(c['version']),
        resourceDigest: digest(c['resourceDigest']),
        ddf: identifier(c['ddf']),
        compiledDigest: digest(c['compiledDigest']),
        devices: Object.fromEntries(
          Object.entries(record(c['devices'])).map(([device, value]) => {
            const e = closed(value, ['registration', 'generation', 'osVersion', 'edition'])
            return [
              identifier(device),
              {
                registration: uuid(e['registration']),
                generation: count(e['generation']),
                osVersion: identifier(e['osVersion']),
                edition: count(e['edition']),
              },
            ]
          }),
        ),
      }
    }),
    plan: {
      id: identifier(p['id']),
      scheduling_open: boolean(p['scheduling_open']),
      dispatch: enumeration(p['dispatch'], ['not_requested'] as const),
      intents: array(p['intents'], (value) => {
        const kind = enumeration(record(value)['kind'], [
          'add',
          'supersede',
          'cancel',
          'retain',
        ] as const)
        const i = closed(
          value,
          kind === 'cancel' || kind === 'retain'
            ? ['kind', 'device', 'version', 'reason']
            : ['kind', 'device', 'version'],
        )
        return {
          kind,
          device: identifier(i['device']),
          version: count(i['version']),
          ...(kind === 'cancel'
            ? {
                reason: enumeration(i['reason'], ['scope_exit', 'archived', 'superseded'] as const),
              }
            : kind === 'retain'
              ? { reason: enumeration(i['reason'], ['current', 'paused', 'historical'] as const) }
              : {}),
        }
      }),
    },
  }
}
function task(value: unknown, policy: string, task: string) {
  const v = closed(value, [
    'task',
    'kind',
    'target',
    'status',
    'processed',
    'members',
    'plan',
    'failure',
    'failureDetail',
    'execution',
    'policyRevision',
  ])
  if (uuid(v['task']) !== task || v['kind'] !== 'policy' || v['target'] !== policy)
    throw new Error('Wrong policy task')
  return {
    task,
    status: enumeration(v['status'], [
      'pending',
      'running',
      'completed',
      'failed',
      'superseded',
    ] as const),
    processed: count(v['processed']),
    members: count(v['members']),
    plan: nullable(v['plan'], identifier),
    failure: nullable(v['failure'], identifier),
    policyRevision: nullable(v['policyRevision'], count),
    execution: nullable(v['execution'], (v) => admission(v, policy)),
    failureDetail: nullable(v['failureDetail'], (value) => {
      const f = closed(value, ['reason', 'device', 'stage'])
      return {
        reason: enumeration(f['reason'], [
          'capability_unknown',
          'platform_unsupported',
          'stale_plan',
          'owner_conflict',
        ] as const),
        device: nullable(f['device'], identifier),
        stage: enumeration(f['stage'], ['preview', 'save', 'execute'] as const),
      }
    }),
  }
}
function receipt(value: unknown, policy: string, operation: string) {
  const v = closed(value, ['policy', 'request', 'storageRevision', 'planId', 'planIsFresh', 'task'])
  if (v['policy'] !== policy || v['request'] !== operation) throw new Error('Wrong policy receipt')
  return {
    policy,
    request: operation,
    storageRevision: count(v['storageRevision']),
    planId: nullable(v['planId'], identifier),
    planIsFresh: boolean(v['planIsFresh']),
    task: nullable(v['task'], uuid),
  }
}
export function createPoliciesClient(transport: HttpTransport) {
  return {
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v2/policies/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => decodePolicy(v, id),
      }),
    change: (id: string, body: Operation<PolicyChange>) =>
      transport.request({
        method: 'POST',
        path: '/api/v2/policies/{id}',
        pathParams: { id },
        body,
        successStatus: 200,
        decode: (v) => receipt(v, id, body.operationId),
      }),
    preview: (id: string, body: Operation<{ scope: string; expectedRevision: number }>) =>
      transport.request({
        method: 'POST',
        path: '/api/v2/policies/{id}/previews',
        pathParams: { id },
        body,
        successStatus: 202,
        decode(value) {
          const v = closed(value, ['task', 'kind', 'target', 'statusUrl'])
          if (
            uuid(v['task']) !== body.operationId ||
            v['kind'] !== 'policy' ||
            v['target'] !== id ||
            v['statusUrl'] !== `/api/v2/plan-previews/${body.operationId}`
          )
            throw new Error('Wrong accepted preview')
          return { task: body.operationId, statusUrl: string(v['statusUrl']) }
        },
      }),
    status: (id: string, result: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v2/plan-previews/{task}',
        pathParams: { task: result },
        successStatus: 200,
        decode: (v) => task(v, id, result),
      }),
    page: (id: string, result: string, projection: PolicyProjection, cursor?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v2/policies/{id}/results/{result}/{projection}',
        pathParams: { id, result, projection },
        query: { limit: 20, cursor },
        successStatus: 200,
        decode: (v) => decodePolicyPage(v, id, result, projection),
      }),
    save: (id: string, body: Operation<{ preview: string }>) =>
      transport.request({
        method: 'POST',
        path: '/api/v2/policies/{id}/plans',
        pathParams: { id },
        body,
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['receipt', 'preview', 'plan', 'dispatch'])
          if (uuid(v['preview']) !== body.input.preview) throw new Error('Wrong saved preview')
          return {
            receipt: receipt(v['receipt'], id, body.operationId),
            preview: body.input.preview,
            plan: nullable(v['plan'], identifier),
            dispatch: enumeration(v['dispatch'], ['not_requested'] as const),
          }
        },
      }),
    execute: (
      id: string,
      plan: string,
      body: { operationId: string; expectedRevision: number; deadline: number },
    ) =>
      transport.request({
        method: 'POST',
        path: '/api/v2/policies/{id}/plans/{plan}/execute',
        pathParams: { id, plan },
        body,
        successStatus: 202,
        decode(value) {
          const v = closed(value, ['plan', 'operations'])
          return {
            plan: uuid(v['plan']),
            operations: array(v['operations'], (value) => {
              const o = closed(
                value,
                ['operationId', 'commandId'],
                ['accepted', 'action', 'commandStatus', 'revision'],
              )
              if ('accepted' in o && o['accepted'] !== true) throw new Error('Invalid admission')
              return {
                operationId: uuid(o['operationId']),
                commandId: uuid(o['commandId']),
                ...('accepted' in o ? { accepted: true as const } : {}),
                ...('action' in o ? { action: enumeration(o['action'], ['cancel'] as const) } : {}),
                ...('commandStatus' in o
                  ? {
                      commandStatus: enumeration(o['commandStatus'], [
                        'queued',
                        'published',
                        'received',
                        'applied',
                        'rejected',
                        'timed_out',
                        'superseded',
                        'cancelled',
                      ] as const),
                    }
                  : {}),
                ...('revision' in o ? { revision: count(o['revision']) } : {}),
              }
            }),
          }
        },
      }),
  }
}
