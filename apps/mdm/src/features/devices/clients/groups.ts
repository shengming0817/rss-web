import type { Operation } from '../../../services/useOperation'
import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  identifier,
  integer,
  nullable,
  record,
  string,
  unique,
  uuid,
} from '../../../services/decode'
import { criteria, cursor, fieldKey, sourceIds, type Criteria } from './asset-model'

export type GroupChange =
  | { action: 'create'; name: string; description: string; criteria: Criteria | null }
  | { action: 'edit'; name: string; description: string }
  | { action: 'rule'; criteria: Criteria }
  | { action: 'members'; add: string[]; remove: string[] }
  | { action: 'delete' | 'recompute' }
export type GroupProjection = 'members' | 'changes' | 'decisions'
export function groupSummary(value: unknown) {
  const v = closed(value, [
    'id',
    'kind',
    'name',
    'description',
    'revision',
    'memberVersion',
    'memberCount',
    'ruleVersion',
    'deleted',
  ])
  return {
    id: uuid(v['id']),
    kind: enumeration(v['kind'], ['static', 'dynamic'] as const),
    name: identifier(v['name']),
    description: string(v['description']),
    revision: count(v['revision']),
    memberVersion: count(v['memberVersion']),
    memberCount: count(v['memberCount']),
    ruleVersion: nullable(v['ruleVersion'], identifier),
    deleted: boolean(v['deleted']),
  }
}
export function decodeGroup(value: unknown, id: string) {
  const v = closed(value, ['group', 'criteria', 'memberSet'])
  const group = groupSummary(v['group'])
  if (group.id !== id) throw new Error('Wrong group')
  return {
    group,
    criteria: nullable(v['criteria'], criteria),
    memberSet: nullable(v['memberSet'], uuid),
  }
}
export type GroupRead = ReturnType<typeof decodeGroup>
function decision(value: unknown) {
  const v = closed(value, ['device', 'origin', 'decision', 'explanations', 'provenance'])
  return {
    device: identifier(v['device']),
    origin: enumeration(v['origin'], ['rule', 'manual'] as const),
    decision: enumeration(v['decision'], ['match', 'no_match', 'unknown'] as const),
    explanations: array(v['explanations'], (value) => {
      const e = closed(value, ['path', 'outcome'])
      return {
        path: array(e['path'], count),
        outcome: enumeration(e['outcome'], [
          'match',
          'no_match',
          'null',
          'missing',
          'deleted',
          'unsupported',
          'conflict',
        ] as const),
      }
    }),
    provenance: array(v['provenance'], (value) => {
      const e = closed(value, ['field', 'source', 'snapshot_id', 'observed_at'])
      return {
        field: fieldKey(e['field']),
        source: enumeration(e['source'], sourceIds),
        snapshot_id: identifier(e['snapshot_id']),
        observed_at: integer(e['observed_at']),
      }
    }),
  }
}
function pageItems(value: unknown) {
  const kind = enumeration(record(value)['kind'], ['members', 'changes', 'decisions'] as const)
  const v = closed(value, kind === 'changes' ? ['kind', 'added', 'removed'] : ['kind', 'items'])
  if (kind === 'members') return { kind, items: unique(array(v['items'], identifier), (s) => s) }
  if (kind === 'changes')
    return {
      kind,
      added: unique(array(v['added'], identifier), (s) => s),
      removed: unique(array(v['removed'], identifier), (s) => s),
    }
  return { kind, items: unique(array(v['items'], decision), (d) => d.device) }
}
export function decodeGroupPage(
  value: unknown,
  group: string,
  result: string,
  kind: GroupProjection,
) {
  const v = closed(value, [
    'result',
    'group',
    'current',
    'totalObjects',
    'totalMembers',
    'page',
    'nextCursor',
  ])
  const page = pageItems(v['page'])
  if (uuid(v['group']) !== group || uuid(v['result']) !== result || page.kind !== kind)
    throw new Error('Wrong group result')
  return {
    group,
    result,
    current: boolean(v['current']),
    totalObjects: count(v['totalObjects']),
    totalMembers: count(v['totalMembers']),
    page,
    nextCursor: cursor(v['nextCursor']),
  }
}
export function createGroupsClient(transport: HttpTransport) {
  function accepted(value: unknown, id: string, operation: string) {
    const v = closed(value, ['task', 'kind', 'target', 'statusUrl'])
    const task = uuid(v['task'])
    if (
      task !== operation ||
      v['kind'] !== 'group' ||
      v['target'] !== id ||
      v['statusUrl'] !== `/api/v2/groups/${id}/tasks/${task}`
    )
      throw new Error('Wrong group task')
    return { task, statusUrl: string(v['statusUrl']) }
  }
  return {
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v2/groups/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => decodeGroup(v, id),
      }),
    change: (id: string, body: Operation<GroupChange>) => {
      const options = {
        method: 'POST' as const,
        path: '/api/v2/groups/{id}',
        pathParams: { id },
        body,
      }
      if (body.input.action === 'members' || body.input.action === 'recompute')
        return transport.request({
          ...options,
          successStatus: 202,
          decode: (v) => accepted(v, id, body.operationId),
        })
      return transport.request({
        ...options,
        successStatus: 200,
        decode: (value) => {
          const v = closed(value, ['operation', 'group', 'added', 'removed', 'task'])
          const group = groupSummary(v['group'])
          if (uuid(v['operation']) !== body.operationId || group.id !== id)
            throw new Error('Wrong group receipt')
          return {
            operation: body.operationId,
            group,
            added: count(v['added']),
            removed: count(v['removed']),
            task: nullable(v['task'], uuid),
          }
        },
      })
    },
    preview: (id: string, body: Operation<Record<string, never>>) =>
      transport.request({
        method: 'POST',
        path: '/api/v2/groups/{id}/previews',
        pathParams: { id },
        body,
        successStatus: 202,
        decode: (v) => accepted(v, id, body.operationId),
      }),
    status: (group: string, task: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v2/groups/{group}/tasks/{task}',
        pathParams: { group, task },
        successStatus: 200,
        decode: (value) => {
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
          if (
            uuid(v['task']) !== task ||
            v['kind'] !== 'group' ||
            v['target'] !== group ||
            v['plan'] !== null ||
            v['execution'] !== null ||
            v['policyRevision'] !== null
          )
            throw new Error('Wrong group task')
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
            failure: nullable(v['failure'], identifier),
            failureDetail: nullable(v['failureDetail'], (value) => {
              const detail = closed(value, ['reason', 'device', 'stage'])
              return {
                reason: enumeration(detail['reason'], [
                  'capability_unknown',
                  'platform_unsupported',
                  'stale_plan',
                  'owner_conflict',
                ] as const),
                device: nullable(detail['device'], identifier),
                stage: enumeration(detail['stage'], ['preview', 'save', 'execute'] as const),
              }
            }),
          }
        },
      }),
    page: (group: string, result: string, kind: GroupProjection, next?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v2/groups/{group}/results/{result}/{kind}',
        pathParams: { group, result, kind },
        query: { limit: 20, cursor: next },
        successStatus: 200,
        decode: (v) => decodeGroupPage(v, group, result, kind),
      }),
  }
}
