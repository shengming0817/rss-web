import { inventoryCondition, type InventoryCondition } from './asset-model'
import { calculationTask } from './calculation-task'
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
import { cursor, fieldKey, sourceIds } from './asset-model'

import { objectRef, objectKey, deviceObject, type ObjectRef } from './objects'

export type GroupChange =
  | {
      action: 'create'
      name: string
      description: string
      assetContext: 'endpoint' | 'associated_device'
      criteria: InventoryCondition | null
    }
  | { action: 'edit'; name: string; description: string }
  | { action: 'rule'; criteria: InventoryCondition }
  | { action: 'members'; add: ObjectRef[]; remove: ObjectRef[] }
  | { action: 'delete' | 'recompute' }
export type GroupProjection = 'members' | 'changes' | 'decisions'
export function groupSummary(value: unknown) {
  const v = closed(value, [
    'id',
    'kind',
    'assetContext',
    'calculationRevision',
    'name',
    'description',
    'revision',
    'memberVersion',
    'memberCount',
    'ruleVersion',
    'deleted',
  ])
  const kind = enumeration(v['kind'], ['static', 'dynamic'] as const),
    assetContext = enumeration(v['assetContext'], ['endpoint', 'associated_device'] as const)
  if (kind === 'static' && assetContext !== 'endpoint')
    throw new Error('Static groups require endpoints')
  return {
    id: uuid(v['id']),
    kind,
    assetContext,
    calculationRevision: count(v['calculationRevision']),
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
    criteria: nullable(v['criteria'], inventoryCondition),
    memberSet: nullable(v['memberSet'], uuid),
  }
}
export type GroupRead = ReturnType<typeof decodeGroup>
function decision(value: unknown) {
  const v = closed(value, [
    'object',
    'sourceObjects',
    'origin',
    'decision',
    'explanations',
    'provenance',
  ])
  return {
    object: objectRef(v['object']),
    sourceObjects: array(v['sourceObjects'], deviceObject),
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
  if (kind === 'members') return { kind, items: unique(array(v['items'], objectRef), objectKey) }
  if (kind === 'changes')
    return {
      kind,
      added: unique(array(v['added'], objectRef), objectKey),
      removed: unique(array(v['removed'], objectRef), objectKey),
    }
  return { kind, items: unique(array(v['items'], decision), (d) => objectKey(d.object)) }
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
      v['statusUrl'] !== `/api/v1/groups/${id}/tasks/${task}`
    )
      throw new Error('Wrong group task')
    return { task, statusUrl: string(v['statusUrl']) }
  }
  return {
    list: (after?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/groups',
        query: { after, limit: 20 },
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['items', 'nextCursor'])
          return {
            items: array(v['items'], groupSummary),
            nextCursor: nullable(v['nextCursor'], uuid),
          }
        },
      }),
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/groups/{id}',
        pathParams: { id },
        successStatus: 200,
        decode: (v) => decodeGroup(v, id),
      }),
    change: (id: string, body: Operation<GroupChange>) => {
      if (
        body.input.action === 'rule' ||
        (body.input.action === 'create' && body.input.criteria !== null)
      )
        inventoryCondition(body.input.criteria)

      const options = {
        method: 'POST' as const,
        path: '/api/v1/groups/{id}',
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
        path: '/api/v1/groups/{id}/previews',
        pathParams: { id },
        body,
        successStatus: 202,
        decode: (v) => accepted(v, id, body.operationId),
      }),
    status: (group: string, task: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/groups/{group}/tasks/{task}',
        pathParams: { group, task },
        successStatus: 200,
        decode: (value) => calculationTask(value, 'group', group, task),
      }),
    page: (group: string, result: string, kind: GroupProjection, next?: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/groups/{group}/results/{result}/{kind}',
        pathParams: { group, result, kind },
        query: { limit: 20, cursor: next },
        successStatus: 200,
        decode: (v) => decodeGroupPage(v, group, result, kind),
      }),
  }
}
