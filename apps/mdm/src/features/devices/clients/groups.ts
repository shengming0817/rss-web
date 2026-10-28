import { queryParameters, projectedPage, type DirectoryQuery } from '@rss/api/mdm-query'
import { jsonObject } from '../../../services/json'
import {
  conditionContext,
  criteria as assetCriteria,
  type ConditionContext,
  type Criteria,
} from './asset-model'
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

export type GroupCriteria =
  | Extract<Criteria, { kind: 'predicate' }>
  | { kind: 'group'; groupId: string; op: 'member_of' | 'not_member_of' }
  | { kind: 'and' | 'or'; children: GroupCriteria[] }
export interface GroupCondition extends ConditionContext {
  criteria: GroupCriteria
}
export function groupCriteria(value: unknown, depth = 0): GroupCriteria {
  if (depth > 16) throw new Error('Group condition too deep')
  const kind = record(value)['kind']
  if (kind === 'group') {
    const v = closed(value, ['kind', 'groupId', 'op'])
    return {
      kind,
      groupId: uuid(v['groupId']),
      op: enumeration(v['op'], ['member_of', 'not_member_of'] as const),
    }
  }
  if (kind === 'and' || kind === 'or') {
    const v = closed(value, ['kind', 'children'])
    return { kind, children: array(v['children'], (x) => groupCriteria(x, depth + 1)) }
  }
  const predicate = assetCriteria(value)
  if (predicate.kind !== 'predicate') throw new Error('Invalid group leaf')
  return predicate
}
export function groupCondition(value: unknown): GroupCondition {
  const v = closed(value, ['selector', 'quantifier', 'criteria'])
  return {
    ...conditionContext({ selector: v['selector'], quantifier: v['quantifier'] }),
    criteria: groupCriteria(v['criteria']),
  }
}
export type GroupDirectoryField = keyof typeof groupFields
export interface GroupQuery<
  F extends GroupDirectoryField = GroupDirectoryField,
> extends DirectoryQuery<F> {
  referenceableFor?: string | undefined
}
export function groupReferences(value: unknown) {
  const v = closed(value, ['items', 'nextCursor', 'deletionBlocked'])
  const source = (value: unknown) => {
    const v = closed(value, ['kind', 'id'])
    return {
      kind: enumeration(v['kind'], ['group', 'scope', 'policy', 'compliance_rule'] as const),
      id: uuid(v['id']),
    }
  }
  return {
    items: array(v['items'], (value) => {
      const item = closed(value, [
        'source',
        'revision',
        'relation',
        'roles',
        'via',
        'lifecycleState',
        'freshness',
        'effective',
        'blocksDeletion',
      ])
      return {
        source: source(item['source']),
        revision: count(item['revision']),
        relation: enumeration(item['relation'], ['direct', 'indirect'] as const),
        roles: array(item['roles'], identifier),
        via: array(item['via'], source),
        lifecycleState: identifier(item['lifecycleState']),
        freshness: identifier(item['freshness']),
        effective: boolean(item['effective']),
        blocksDeletion: boolean(item['blocksDeletion']),
      }
    }),
    nextCursor: cursor(v['nextCursor']),
    deletionBlocked: boolean(v['deletionBlocked']),
  }
}
export function groupPresentation(value: unknown) {
  const v = jsonObject(value, 65_536)
  return { ...v, name: identifier(v['name']), description: string(v['description']) }
}
export type GroupChange =
  | {
      action: 'create'
      presentation: ReturnType<typeof groupPresentation>
      assetContext: 'endpoint' | 'associated_device'
      criteria: GroupCondition | null
    }
  | { action: 'edit'; presentation: ReturnType<typeof groupPresentation> }
  | { action: 'rule'; criteria: GroupCondition }
  | { action: 'members'; add: ObjectRef[]; remove: ObjectRef[] }
  | { action: 'delete' | 'recompute' }
export type GroupTaskKind = 'group' | 'group_preview' | 'group_definition'
export type GroupProjection = 'members' | 'changes' | 'decisions'
const groupFields = {
  id: uuid,
  kind: (v: unknown) => enumeration(v, ['static', 'dynamic', 'system'] as const),
  systemSelector: (v: unknown) =>
    nullable(v, (x) => enumeration(x, ['all_active', 'windows', 'macos'] as const)),
  assetContext: (v: unknown) => enumeration(v, ['endpoint', 'associated_device'] as const),
  calculationRevision: count,
  presentation: groupPresentation,
  revision: count,
  memberVersion: count,
  memberCount: count,
  ruleVersion: (v: unknown) => nullable(v, identifier),
  deleted: boolean,
}
export function groupSummary(value: unknown) {
  const v = closed(value, [
    'id',
    'kind',
    'systemSelector',
    'assetContext',
    'calculationRevision',
    'presentation',
    'revision',
    'memberVersion',
    'memberCount',
    'ruleVersion',
    'deleted',
  ])
  const kind = enumeration(v['kind'], ['static', 'dynamic', 'system'] as const),
    assetContext = enumeration(v['assetContext'], ['endpoint', 'associated_device'] as const)
  const systemSelector = nullable(v['systemSelector'], (x) =>
    enumeration(x, ['all_active', 'windows', 'macos'] as const),
  )
  if ((kind === 'system') !== (systemSelector !== null)) throw new Error('Invalid system group')
  if (kind !== 'dynamic' && assetContext !== 'endpoint')
    throw new Error('Static groups require endpoints')
  return {
    id: uuid(v['id']),
    kind,
    systemSelector,
    assetContext,
    calculationRevision: count(v['calculationRevision']),
    presentation: groupPresentation(v['presentation']),
    revision: count(v['revision']),
    memberVersion: count(v['memberVersion']),
    memberCount: count(v['memberCount']),
    ruleVersion: nullable(v['ruleVersion'], identifier),
    deleted: boolean(v['deleted']),
  }
}
export function decodeGroup(value: unknown, id: string) {
  const v = closed(value, ['group', 'criteria', 'memberSet', 'freshness'])
  const group = groupSummary(v['group'])
  if (group.id !== id) throw new Error('Wrong group')
  return {
    group,
    criteria: nullable(v['criteria'], groupCondition),
    memberSet: nullable(v['memberSet'], uuid),
    freshness: enumeration(v['freshness'], ['current', 'pending'] as const),
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
    'sources',
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
    sources: array(v['sources'], (value) => {
      const source = closed(value, ['group', 'coordinates']),
        c = closed(source['coordinates'], [
          'definitionVersion',
          'memberVersion',
          'authorityVersion',
          'memberSet',
          'assetContext',
        ])
      return {
        group: uuid(source['group']),
        coordinates: {
          definitionVersion: count(c['definitionVersion']),
          memberVersion: count(c['memberVersion']),
          authorityVersion: count(c['authorityVersion']),
          memberSet: nullable(c['memberSet'], uuid),
          assetContext: enumeration(c['assetContext'], ['endpoint', 'associated_device'] as const),
        },
      }
    }),
    current: boolean(v['current']),
    totalObjects: count(v['totalObjects']),
    totalMembers: count(v['totalMembers']),
    page,
    nextCursor: cursor(v['nextCursor']),
  }
}
export function createGroupsClient(transport: HttpTransport) {
  function accepted(value: unknown, id: string, operation: string, kind: GroupTaskKind) {
    const v = closed(value, ['task', 'kind', 'target', 'statusUrl'])
    const task = uuid(v['task'])
    if (
      task !== operation ||
      v['kind'] !== kind ||
      v['target'] !== id ||
      v['statusUrl'] !== `/api/v1/groups/${id}/tasks/${task}`
    )
      throw new Error('Wrong group task')
    return { task, kind, statusUrl: string(v['statusUrl']) }
  }
  return {
    list: <F extends GroupDirectoryField = GroupDirectoryField>(query: GroupQuery<F> = {}) => {
      const { referenceableFor, ...parameters } = query
      return transport.request({
        method: 'GET',
        path: '/api/v1/groups',
        query: {
          ...queryParameters({ limit: 20, ...parameters }),
          ...(referenceableFor === undefined ? {} : { referenceableFor: uuid(referenceableFor) }),
        },
        successStatus: 200,
        decode(value) {
          const page = projectedPage(value, groupFields, query.fields, ['id'])
          if (query.fields === undefined) page.items.forEach(groupSummary)
          return page
        },
      })
    },
    references: (
      id: string,
      query: {
        kind?: 'group' | 'scope' | 'policy' | 'compliance_rule' | undefined
        relation?: 'direct' | 'indirect' | 'all' | undefined
        cursor?: string | undefined
      } = {},
    ) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/groups/{id}/references',
        pathParams: { id: uuid(id) },
        query: { ...query, limit: 20 },
        successStatus: 200,
        decode: groupReferences,
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
        groupCondition(body.input.criteria)

      const options = {
        method: 'POST' as const,
        path: '/api/v1/groups/{id}',
        pathParams: { id },
        body,
      }
      if (
        body.input.action === 'members' ||
        body.input.action === 'recompute' ||
        body.input.action === 'rule' ||
        (body.input.action === 'create' && body.input.criteria !== null)
      )
        return transport.request({
          ...options,
          successStatus: 202,
          decode: (v) =>
            accepted(
              v,
              id,
              body.operationId,
              body.input.action === 'rule' || body.input.action === 'create'
                ? 'group_definition'
                : 'group',
            ),
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
        decode: (v) => accepted(v, id, body.operationId, 'group_preview'),
      }),
    status: (group: string, task: string, kind: GroupTaskKind = 'group') =>
      transport.request({
        method: 'GET',
        path: '/api/v1/groups/{group}/tasks/{task}',
        pathParams: { group, task },
        successStatus: 200,
        decode: (value) => calculationTask(value, kind, group, task),
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
