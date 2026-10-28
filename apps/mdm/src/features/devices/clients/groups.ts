import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import {
  queryParameters,
  projectedPage,
  type DirectoryQuery,
} from '../../../services/directory-query'
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
  count,
  enumeration,
  identifier,
  integer,
  nullable,
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
  if (!wireSchemas.postApiV1GroupsByIdBody.validateCriteria(value))
    throw new Error('Invalid contract value')

  if (depth > 16) throw new Error('Group condition too deep')
  const kind = value['kind']
  if (kind === 'group') {
    const v = value
    return {
      kind,
      groupId: uuid(v['groupId']),
      op: v['op'],
    }
  }
  if (kind === 'and' || kind === 'or') {
    const v = value
    return { kind, children: array(v['children'], (x) => groupCriteria(x, depth + 1)) }
  }
  const predicate = assetCriteria(value)
  if (predicate.kind !== 'predicate') throw new Error('Invalid group leaf')
  return predicate
}
export function groupCondition(value: unknown): GroupCondition {
  if (!wireSchemas.postApiV1GroupsByIdBody.validateInventoryCondition(value))
    throw new Error('Invalid contract value')

  const v = value
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
  if (!wireSchemas.getApiV1GroupsByIdReferencesResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  const source = (value: unknown) => {
    if (!wireSchemas.getApiV1GroupsByIdReferencesResponse.validateObject(value))
      throw new Error('Invalid contract value')

    const v = value
    return {
      kind: v['kind'],
      id: uuid(v['id']),
    }
  }
  return {
    items: array(v['items'], (value) => {
      const item = value
      return {
        source: source(item['source']),
        revision: count(item['revision']),
        relation: item['relation'],
        roles: array(item['roles'], identifier),
        via: array(item['via'], source),
        lifecycleState: identifier(item['lifecycleState']),
        freshness: identifier(item['freshness']),
        effective: item['effective'],
        blocksDeletion: item['blocksDeletion'],
      }
    }),
    nextCursor: cursor(v['nextCursor']),
    deletionBlocked: v['deletionBlocked'],
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
  if (!wireSchemas.getApiV1GroupsByIdResponse200.validateGroup(value))
    throw new Error('Invalid contract value')

  const v = value
  const kind = v['kind'],
    assetContext = v['assetContext']
  const systemSelector = nullable(v['systemSelector'], (x) => x)
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
    deleted: v['deleted'],
  }
}
export function decodeGroup(value: unknown, id: string) {
  if (!wireSchemas.getApiV1GroupsByIdResponse200.validateGroupRead(value))
    throw new Error('Invalid contract value')

  const v = value

  const group = groupSummary(v['group'])
  if (group.id !== id) throw new Error('Wrong group')
  return {
    group,
    criteria: nullable(v['criteria'], groupCondition),
    memberSet: nullable(v['memberSet'], uuid),
    freshness: v['freshness'],
  }
}
export type GroupRead = ReturnType<typeof decodeGroup>
function decision(value: unknown) {
  if (!wireSchemas.getApiV1GroupsByIdResponse200.validateDecisionView(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    object: objectRef(v['object']),
    sourceObjects: array(v['sourceObjects'], deviceObject),
    origin: enumeration(v['origin'], ['rule', 'manual'] as const),
    decision: enumeration(v['decision'], ['match', 'no_match', 'unknown'] as const),
    explanations: array(v['explanations'], (value) => {
      const e = value
      return {
        context: string(e.context),
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
      const e = value
      return {
        context: string(e.context),
        field: fieldKey(e['field']),
        source: enumeration(e['source'], sourceIds),
        snapshot_id: identifier(e['snapshot_id']),
        observed_at: integer(e['observed_at']),
      }
    }),
  }
}
function pageItems(value: unknown) {
  if (!wireSchemas.getApiV1GroupsByIdResponse200.validateGroupPageItems(value))
    throw new Error('Invalid contract value')

  const v = value
  const kind = v.kind
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
  if (!wireSchemas.getApiV1GroupsByIdResponse200.validateGroupPage(value))
    throw new Error('Invalid contract value')

  const v = value
  const page = pageItems(v['page'])
  if (uuid(v['group']) !== group || uuid(v['result']) !== result || page.kind !== kind)
    throw new Error('Wrong group result')
  return {
    group,
    result,
    sources: array(v['sources'], (value) => {
      const source = value,
        c = source['coordinates']
      return {
        group: uuid(source['group']),
        coordinates: {
          definitionVersion: count(c['definitionVersion']),
          memberVersion: count(c['memberVersion']),
          authorityVersion: count(c['authorityVersion']),
          memberSet: nullable(c['memberSet'], uuid),
          assetContext: c['assetContext'],
        },
      }
    }),
    current: v['current'],
    totalObjects: count(v['totalObjects']),
    totalMembers: count(v['totalMembers']),
    page,
    nextCursor: cursor(v['nextCursor']),
  }
}
export function createGroupsClient(transport: HttpTransport) {
  function accepted(value: unknown, id: string, operation: string, kind: GroupTaskKind) {
    if (!wireSchemas.getApiV1GroupsByIdResponse202.validateJobAccepted(value))
      throw new Error('Invalid contract value')

    const v = value
    const task = uuid(v['task'])
    if (
      task !== operation ||
      v['kind'] !== kind ||
      v['target'] !== id ||
      v['statusUrl'] !== api.getApiV1GroupsByGroupTasksByTask.url({ group: id, task })
    )
      throw new Error('Wrong group task')
    return { task, kind, statusUrl: string(v['statusUrl']) }
  }
  return {
    list: <F extends GroupDirectoryField = GroupDirectoryField>(query: GroupQuery<F> = {}) => {
      const { referenceableFor, ...parameters } = query
      return api.getApiV1Groups(
        transport,
        {
          query: {
            ...queryParameters({ limit: 20, ...parameters }),
            ...(referenceableFor === undefined ? {} : { referenceableFor: uuid(referenceableFor) }),
          },
        },
        (value) => {
          const page = projectedPage(value, groupFields, query.fields, ['id'])
          if (query.fields === undefined) page.items.forEach(groupSummary)
          return page
        },
      )
    },
    references: (
      id: string,
      query: {
        kind?: 'group' | 'scope' | 'policy' | 'compliance_rule' | undefined
        relation?: 'direct' | 'indirect' | 'all' | undefined
        cursor?: string | undefined
      } = {},
    ) =>
      api.getApiV1GroupsByIdReferences(
        transport,
        { pathParams: { id: uuid(id) }, query: { ...query, limit: 20 } },
        groupReferences,
      ),
    read: (id: string) =>
      api.getApiV1GroupsById(transport, { pathParams: { id } }, (v) => decodeGroup(v, id)),
    change: (id: string, body: Operation<GroupChange>) => {
      if (
        body.input.action === 'rule' ||
        (body.input.action === 'create' && body.input.criteria !== null)
      )
        groupCondition(body.input.criteria)

      const options = {
        pathParams: { id },
        body,
      }
      if (
        body.input.action === 'members' ||
        body.input.action === 'recompute' ||
        body.input.action === 'rule' ||
        (body.input.action === 'create' && body.input.criteria !== null)
      )
        return api.postApiV1GroupsById(transport, { ...options }, (v) =>
          accepted(
            v,
            id,
            body.operationId,
            body.input.action === 'rule' || body.input.action === 'create'
              ? 'group_definition'
              : 'group',
          ),
        )
      return api.postApiV1GroupsById(transport, { ...options }, (value) => {
        const v = value
        if (
          !('group' in v) ||
          !('operation' in v) ||
          !('added' in v) ||
          !('removed' in v) ||
          !('task' in v)
        )
          throw new Error('Wrong group receipt')
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
      })
    },
    preview: (id: string, body: Operation<Record<string, never>>) =>
      api.postApiV1GroupsByIdPreviews(transport, { pathParams: { id }, body }, (v) =>
        accepted(v, id, body.operationId, 'group_preview'),
      ),
    status: (group: string, task: string, kind: GroupTaskKind = 'group') =>
      api.getApiV1GroupsByGroupTasksByTask(transport, { pathParams: { group, task } }, (value) =>
        calculationTask(value, kind, group, task),
      ),
    page: (group: string, result: string, kind: GroupProjection, next?: string) =>
      api.getApiV1GroupsByGroupResultsByResultByKind(
        transport,
        { pathParams: { group, result, kind }, query: { limit: 20, cursor: next } },
        (v) => decodeGroupPage(v, group, result, kind),
      ),
  }
}
