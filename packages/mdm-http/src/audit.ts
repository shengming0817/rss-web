import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import {
  comparison,
  nextCursor,
  pageCursor,
  projectedPage,
  queryParameters,
} from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import type {
  ActivityDetail,
  ActivityPage,
  AuditFact,
  AuditPage,
  AuditPolicyIdentity,
  AuditPolicyLookupPort,
  AuditPort,
  ManagementActivity,
} from '@rss/mdm-audit'
import { boolean, count, enumeration, list, nullable, positive, text, uuid } from './decode'
import { distinct, integer, requestInput } from './inventory-values'

function fact(value: unknown): AuditFact {
  if (!schema.getApiV1AuditEventsResponse.validateFactView(value))
    throw new Error('Invalid safe audit fact')
  return {
    source: text(value.source),
    eventId: text(value.eventId),
    position: count(value.position),
    recordedAt: integer(value.recordedAt),
    observedAt: integer(value.observedAt),
    actorKind: text(value.actorKind),
    actor: text(value.actor),
    action: text(value.action),
    target: { type: text(value.target.type), id: text(value.target.id) },
    deviceId: nullable(value.deviceId, text),
    operationId: nullable(value.operationId, uuid),
    relatedOperationIds: list(value.relatedOperationIds, uuid),
    requestId: nullable(value.requestId, uuid),
    registrationId: nullable(value.registrationId, uuid),
    registrationRequestId: nullable(value.registrationRequestId, uuid),
    instanceId: nullable(value.instanceId, uuid),
    auditOutcome: text(value.auditOutcome),
    phase: text(value.phase),
    executionState: nullable(value.executionState, text),
    effect: text(value.effect),
    requestWriteOutcome: nullable(value.requestWriteOutcome, text),
    supported: boolean(value.supported),
  }
}
function auditPage(value: unknown): AuditPage {
  if (!schema.getApiV1AuditEventsResponse.validateRoot(value)) throw new Error('Invalid audit page')
  return {
    items: list(value.items, fact, 200),
    nextCursor: nextCursor(value.nextCursor),
    coverage: { complete: boolean(value.coverage.complete) },
  }
}
function activity(value: unknown): ManagementActivity {
  if (!schema.getApiV1DevicesByDeviceManagementActivitiesResponse.validateManagementActivity(value))
    throw new Error('Invalid safe management activity')
  const links = value.links
  return {
    id: text(value.id),
    source: text(value.source),
    kind: value.kind,
    phase: value.phase,
    recordedAt: integer(value.recordedAt),
    observedAt: integer(value.observedAt),
    origin: value.origin,
    target:
      value.target === null
        ? null
        : {
            device: text(value.target.device),
            registration: uuid(value.target.registration),
            generation: positive(value.target.generation),
          },
    links: {
      policy: nullable(links.policy, uuid),
      version: nullable(links.version, uuid),
      batch: nullable(links.batch, uuid),
      member: nullable(links.member, uuid),
      request: nullable(links.request, uuid),
      operation: nullable(links.operation, uuid),
      retirement: nullable(links.retirement, uuid),
      task: nullable(links.task, uuid),
      attempt: nullable(links.attempt, uuid),
      steps: list(links.steps, text),
      operations: links.operations.map((operation) => ({
        kind: operation.kind,
        id: uuid(operation.id),
      })),
    },
    delivery: value.delivery,
    execution: value.execution,
    effect: value.effect,
    reporting: value.reporting,
    decision: value.decision,
    auditOutcome: text(value.auditOutcome),
  }
}
function activities(value: unknown): ActivityPage {
  if (!schema.getApiV1DevicesByDeviceManagementActivitiesResponse.validateRoot(value))
    throw new Error('Invalid management activity page')
  return {
    items: distinct(list(value.items, activity, 200), (item) => item.id),
    nextCursor: nextCursor(value.nextCursor),
    syncCursor: pageCursor(value.syncCursor),
    asOf: integer(value.asOf),
    retainedFrom: nullable(value.retainedFrom, integer),
    coverage: value.coverage.map((coverage) => ({
      source: text(coverage.source),
      complete: boolean(coverage.complete),
      reasons: list(coverage.reasons, text),
    })),
  }
}
function detail(value: unknown, id: string): ActivityDetail {
  if (
    !schema.getApiV1DevicesByDeviceManagementActivitiesByIdResponse.validateRoot(value) ||
    value.personal ||
    value.activity.id !== id
  )
    throw new Error('Wrong management activity detail')
  return {
    activity: activity(value.activity),
    personal: false,
    related: value.related.map(activity),
    relatedCursor: nextCursor(value.relatedCursor),
    missing: list(value.missing, text),
    asOf: integer(value.asOf),
  }
}
export function createAuditAdapter(transport: HttpTransport): AuditPort {
  return {
    search: (query) =>
      api.getApiV1AuditEvents(
        transport,
        {
          query: requestInput(
            { limit: 50, ...query },
            schema.getApiV1AuditEventsQuery.validateRoot,
          ),
        },
        auditPage,
      ),
    timeline: (device, query) =>
      api.getApiV1DevicesByDeviceTimeline(
        transport,
        {
          pathParams: { device },
          query: requestInput(
            { limit: 50, ...query },
            schema.getApiV1DevicesByDeviceTimelineQuery.validateRoot,
          ),
        },
        auditPage,
      ),
    activities: (device, query) =>
      api.getApiV1DevicesByDeviceManagementActivities(
        transport,
        {
          pathParams: { device },
          query: requestInput(
            { limit: 50, ...query },
            schema.getApiV1DevicesByDeviceManagementActivitiesQuery.validateRoot,
          ),
        },
        activities,
      ),
    activity: (device, id) =>
      api.getApiV1DevicesByDeviceManagementActivitiesById(
        transport,
        { pathParams: { device, id } },
        (value) => detail(value, id),
      ),
  }
}
const policyFields = {
  id: uuid,
  toolName: text,
  alias: (v: unknown) => nullable(v, text),
  customEvent: (v: unknown) => nullable(v, text),
  state: (v: unknown) => enumeration(v, ['enabled', 'disabled', 'archived'] as const),
  revision: count,
  versionId: uuid,
}
/** Only a safe current identity is retained; complete Policy definitions and schemas are discarded. */
export function createAuditPolicyLookupAdapter(
  transport: HttpTransport,
  tenant: string,
  instance: string,
): AuditPolicyLookupPort {
  uuid(tenant)
  uuid(instance)
  return {
    resolve: (address) =>
      api.postApiV1PoliciesResolve(
        transport,
        { body: requestInput(address, schema.postApiV1PoliciesResolveBody.validateRoot) },
        (value): AuditPolicyIdentity => {
          if (!schema.postApiV1PoliciesResolveResponse.validateRoot(value))
            throw new Error('Invalid policy identity')
          const { policy, capability } = value
          if (
            capability.id !== policy.id ||
            capability.tenant !== tenant ||
            capability.instance !== instance ||
            capability.revision !== policy.revision ||
            capability.version !== policy.versionId ||
            capability.objectType !== 'policy'
          )
            throw new Error('Mismatched policy capability')
          return {
            id: uuid(policy.id),
            toolName: text(capability.toolName),
            alias: nullable(capability.alias, text),
            customEvent: nullable(policy.definition.customEvent, text),
            state: policy.state,
            revision: count(policy.revision),
            versionId: uuid(policy.versionId),
          }
        },
      ),
    byEvent: (event, query) =>
      api.getApiV1Policies(
        transport,
        {
          query: queryParameters({
            ...query,
            limit: query.limit ?? 20,
            filter: comparison('customEvent', '==', event),
            fields: Object.keys(policyFields),
            sort: ['id'],
          }),
        },
        (value) => projectedPage(value, policyFields, undefined, ['id']),
      ),
  }
}
