import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import { nextCursor, projectedPage, queryParameters } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import type { DeviceRef, PrimaryRegistration } from '@rss/mdm-devices'
import type {
  Decision,
  Group,
  GroupCondition,
  GroupCriteria,
  GroupRead,
  GroupResult,
  GroupRow,
  GroupsPort,
  TaskAccepted,
} from '@rss/mdm-groups'
import { boolean, count, enumeration, nullable, positive, text, uuid } from './decode'
import {
  boundedObject,
  conditionContext,
  conditionValue,
  distinct,
  integer,
  requestInput,
  windowQuery,
} from './inventory-values'

function objectRef(value: unknown): DeviceRef {
  if (!schema.getApiV1GroupsByIdResponse200.validateObjectRef(value))
    throw new Error('Invalid group object')
  if (value.kind === 'association') uuid(value.id)
  return { kind: value.kind, id: text(value.id) }
}
function groupCriteria(value: unknown): GroupCriteria {
  if (!schema.getApiV1GroupsByIdResponse200.validateCriteria(value))
    throw new Error('Invalid group criteria')
  if (value.kind === 'group') return { kind: 'group', groupId: uuid(value.groupId), op: value.op }
  if (value.kind === 'and' || value.kind === 'or')
    return { kind: value.kind, children: value.children.map(groupCriteria) }
  return {
    kind: 'predicate',
    field: value.field,
    op: value.op,
    ...(value.value === null ? {} : { value: conditionValue(value.value) }),
    ...(value.values === null ? {} : { values: value.values.map(conditionValue) }),
  }
}
function groupCondition(value: unknown): GroupCondition {
  if (!schema.getApiV1GroupsByIdResponse200.validateCondition(value))
    throw new Error('Invalid group condition')
  return {
    ...conditionContext({ selector: value.selector, quantifier: value.quantifier }),
    criteria: groupCriteria(value.criteria),
  }
}
function group(value: unknown): Group {
  if (!schema.getApiV1GroupsByIdResponse200.validateGroup(value)) throw new Error('Invalid group')
  return {
    ...value,
    id: uuid(value.id),
    presentation: boundedObject(value.presentation),
    revision: positive(value.revision),
    calculationRevision: count(value.calculationRevision),
    memberVersion: count(value.memberVersion),
    memberCount: count(value.memberCount),
  }
}
function read(value: unknown, id: string): GroupRead {
  if (!schema.getApiV1GroupsByIdResponse200.validateGroupRead(value))
    throw new Error('Invalid group detail')
  const row = group(value.group)
  if (row.id !== id) throw new Error('Wrong group detail')
  return {
    group: row,
    criteria: nullable(value.criteria, groupCondition),
    memberSet: nullable(value.memberSet, uuid),
    freshness: value.freshness,
  }
}
function accepted(value: unknown, id: string): TaskAccepted {
  if (!schema.postApiV1GroupsByIdResponse202.validateJobAccepted(value))
    throw new Error('Invalid group task receipt')
  const kind = enumeration(value.kind, ['group', 'group_preview', 'group_definition'] as const),
    task = uuid(value.task)
  if (
    value.target !== id ||
    value.statusUrl !== api.getApiV1GroupsByGroupTasksByTask.url({ group: id, task })
  )
    throw new Error('Wrong group task binding')
  return { task, target: id, kind, statusUrl: value.statusUrl }
}
function registration(value: unknown): PrimaryRegistration {
  if (!schema.getApiV1GroupsByIdResponse200.validatePrimaryRegistration(value))
    throw new Error('Invalid source registration')
  return {
    device: text(value.device),
    channel: value.channel,
    registrationId: uuid(value.registrationId),
    generation: positive(value.generation),
  }
}
function decision(value: unknown): Decision {
  if (!schema.getApiV1GroupsByIdResponse200.validateDecisionView(value))
    throw new Error('Invalid group decision')
  return {
    ...value,
    object: objectRef(value.object),
    explanations: value.explanations.map((explanation) => ({
      ...explanation,
      path: explanation.path.map(count),
    })),
    provenance: value.provenance.map((fact) => ({ ...fact })),
    sourceObjects: value.sourceObjects.map((source) => ({
      ...source,
      object: objectRef(source.object),
      associationVersion: nullable(source.associationVersion, positive),
      members: source.members.map(registration),
    })),
  }
}
function result(
  value: unknown,
  groupId: string,
  resultId: string,
  kind: GroupResult['page']['kind'],
): GroupResult {
  if (!schema.getApiV1GroupsByIdResponse200.validateGroupPage(value))
    throw new Error('Invalid group result')
  if (value.group !== groupId || value.result !== resultId || value.page.kind !== kind)
    throw new Error('Wrong group result binding')
  const page = value.page
  return {
    result: resultId,
    group: groupId,
    current: value.current,
    totalObjects: count(value.totalObjects),
    totalMembers: count(value.totalMembers),
    nextCursor: nextCursor(value.nextCursor),
    sources: distinct(
      value.sources.map((source) => ({
        group: uuid(source.group),
        coordinates: {
          ...source.coordinates,
          memberSet: nullable(source.coordinates.memberSet, uuid),
          definitionVersion: positive(source.coordinates.definitionVersion),
          memberVersion: count(source.coordinates.memberVersion),
          authorityVersion: count(source.coordinates.authorityVersion),
        },
      })),
      (source) => source.group,
    ),
    page:
      page.kind === 'members'
        ? {
            kind: 'members',
            items: distinct(page.items.map(objectRef), (item) => JSON.stringify(item)),
          }
        : page.kind === 'changes'
          ? {
              kind: 'changes',
              added: page.added.map(objectRef),
              removed: page.removed.map(objectRef),
            }
          : {
              kind: 'decisions',
              items: distinct(page.items.map(decision), (item) => JSON.stringify(item.object)),
            },
  }
}
const directoryFields = {
  id: uuid,
  revision: positive,
  kind: (value: unknown) => enumeration(value, ['static', 'dynamic', 'system'] as const),
  assetContext: (value: unknown) => enumeration(value, ['endpoint', 'associated_device'] as const),
  deleted: boolean,
  memberCount: count,
  calculationRevision: count,
  memberVersion: count,
  presentation: boundedObject,
  systemSelector: (value: unknown) =>
    nullable(value, (value) => enumeration(value, ['all_active', 'windows', 'macos'] as const)),
  ruleVersion: (value: unknown) => nullable(value, text),
}
/** Group authority, dependency admission and computation remain at the formal backend owner. */
export function createGroupsAdapter(transport: HttpTransport): GroupsPort {
  return {
    list: (query = {}) => {
      const { referenceableFor, ...directory } = query
      if (directory.fields && !directory.fields.includes('id'))
        throw new Error('Directory identity required')
      return api.getApiV1Groups(
        transport,
        {
          query: {
            ...queryParameters({ limit: 20, ...directory }),
            ...(referenceableFor === undefined ? {} : { referenceableFor: uuid(referenceableFor) }),
          },
        },
        (value) =>
          projectedPage(value, directoryFields, directory.fields, ['id']) as {
            items: GroupRow[]
            nextCursor: string | null
          },
      )
    },
    read: (id) =>
      api.getApiV1GroupsById(transport, { pathParams: { id: uuid(id) } }, (value) =>
        read(value, id),
      ),
    change: (id, change) =>
      api.postApiV1GroupsById(
        transport,
        {
          pathParams: { id: uuid(id) },
          body: requestInput(change, schema.postApiV1GroupsByIdBody.validateRoot),
        },
        (value) => {
          if (!schema.postApiV1GroupsByIdResponse200.validateGroupReceipt(value))
            return accepted(value, id)
          if (value.operation !== change.operationId || value.group.id !== id)
            throw new Error('Wrong group change receipt')
          return {
            operation: change.operationId,
            group: group(value.group),
            added: count(value.added),
            removed: count(value.removed),
            task: nullable(value.task, uuid),
          }
        },
      ),
    preview: (request) =>
      api.postApiV1GroupsPreviews(
        transport,
        {
          body: requestInput(request, schema.postApiV1GroupsPreviewsBody.validateRoot),
        },
        (value) => ({
          items: distinct(value.items.map(objectRef), (item) => `${item.kind}/${item.id}`),
          scanComplete: boolean(value.scanComplete),
          inputFingerprint: text(value.inputFingerprint),
          assetCut: {
            tenant: uuid(value.assetCut.tenant),
            epoch: uuid(value.assetCut.epoch),
            snapshot: text(value.assetCut.snapshot),
          },
          objectSnapshot: nullable(value.objectSnapshot, uuid),
          sources: value.sources.map((source) => ({
            group: uuid(source.group),
            coordinates: {
              ...source.coordinates,
              memberSet: nullable(source.coordinates.memberSet, uuid),
              definitionVersion: count(source.coordinates.definitionVersion),
              memberVersion: count(source.coordinates.memberVersion),
              authorityVersion: count(source.coordinates.authorityVersion),
            },
          })),
          asOf: integer(value.asOf),
        }),
      ),
    task: (group, task) =>
      api.getApiV1GroupsByGroupTasksByTask(
        transport,
        { pathParams: { group: uuid(group), task: uuid(task) } },
        (value) => {
          if (
            !schema.getApiV1GroupsByIdResponse200.validateTaskRead(value) ||
            value.task !== task ||
            value.target !== group
          )
            throw new Error('Wrong group task')
          return {
            ...value,
            task,
            target: group,
            kind: enumeration(value.kind, ['group', 'group_preview', 'group_definition'] as const),
            status: enumeration(value.status, [
              'pending',
              'running',
              'completed',
              'failed',
              'superseded',
            ] as const),
            processed: count(value.processed),
            members: count(value.members),
            replacementTask: nullable(value.replacementTask, uuid),
          }
        },
      ),
    result: (group, resultId, kind, query = {}) =>
      api.getApiV1GroupsByGroupResultsByResultByKind(
        transport,
        {
          pathParams: { group: uuid(group), result: uuid(resultId), kind },
          query: windowQuery(query),
        },
        (value) => result(value, group, resultId, kind),
      ),
    references: (group, query = {}) =>
      api.getApiV1GroupsByIdReferences(
        transport,
        {
          pathParams: { id: uuid(group) },
          query: {
            ...windowQuery(query),
            ...(query.kind === undefined ? {} : { kind: query.kind }),
            ...(query.relation === undefined ? {} : { relation: query.relation }),
          },
        },
        (value) => ({
          deletionBlocked: value.deletionBlocked,
          nextCursor: nextCursor(value.nextCursor),
          items: value.items.map((entry) => ({
            ...entry,
            revision: positive(entry.revision),
            source: { kind: entry.source.kind, id: uuid(entry.source.id) },
            via: entry.via.map((source) => ({ kind: source.kind, id: uuid(source.id) })),
          })),
        }),
      ),
  }
}
