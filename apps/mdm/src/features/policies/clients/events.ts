import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  count,
  enumeration,
  identifier,
  nullable,
  record,
  uuid,
} from '../../../services/decode'
import {
  projectedPage,
  projectedRow,
  queryParameters,
  type DirectoryQuery,
} from '../../../services/directory-query'
import { jsonValue } from '../../../services/json'
import { policyName } from './model'
export function operationReference(value: unknown) {
  if (
    !wireSchemas.getApiV1DevicesByDevicePolicyEventBatchesByBatchMembersResponse.validatePolicyEventOperation(
      value,
    )
  )
    throw new Error('Invalid contract value')

  const v = value
  return {
    kind: v['kind'],
    id: uuid(v['id']),
  }
}
export function eventDecision(value: unknown) {
  if (
    !wireSchemas.getApiV1DevicesByDevicePolicyEventBatchesByBatchMembersResponse.validatePolicyEventDecision(
      value,
    )
  )
    throw new Error('Invalid event decision')
  return {
    state: value.state,
    operations: value.state === 'accepted' ? value.operations.map(operationReference) : [],
    reason: value.state === 'no_change' || value.state === 'rejected' ? value.reason : null,
  }
}
const batchFields = {
  id: uuid,
  operationId: uuid,
  event: policyName,
  createdAt: count,
  deadline: count,
  members: count,
  admission: (v: unknown) =>
    Object.fromEntries(
      Object.entries(record(v)).map(([key, value]) => [
        enumeration(key, ['pending', 'accepted', 'no_change', 'rejected', 'expired'] as const),
        count(value),
      ]),
    ),
  request: (value: unknown) => {
    if (
      !wireSchemas.getApiV1DevicesByDevicePolicyEventBatchesResponse.validatePolicyEventRequest(
        value,
      )
    )
      throw new Error('Invalid contract value')

    const v = value
    const source = v['source'],
      kind = source['kind']

    if (kind === 'policy') uuid(source['runId'])
    return { operationId: uuid(v['operationId']), event: policyName(v['event']), source: kind }
  },
  processingFailure: (v: unknown) => nullable(v, identifier),
}
const memberFields = {
  id: uuid,
  policyId: uuid,
  versionId: uuid,
  revision: count,
  state: (v: unknown) =>
    enumeration(v, ['pending', 'accepted', 'no_change', 'rejected', 'expired'] as const),
  decision: eventDecision,
  operations: (v: unknown) =>
    array(v, (value) => {
      if (
        !wireSchemas.getApiV1DevicesByDevicePolicyEventBatchesByBatchMembersResponse.validateEventOperationProgress(
          value,
        )
      )
        throw new Error('Invalid event operation')
      const o = value,
        reference = operationReference(o['reference'])
      const actions = array(o['allowedActions'], identifier)
      // This management projection currently grants no controls; each original owner authorizes its own actions.
      if (actions.length) throw new Error('Unsupported batch control')
      return {
        reference,
        state:
          reference.kind === 'retirement' ? jsonValue(o['state'], 65536) : identifier(o['state']),
        allowedActions: actions,
        agentInstallation:
          'agentInstallation' in o ? jsonValue(o['agentInstallation'], 65536) : null,
      }
    }),
}
export function createEventsClient(transport: HttpTransport) {
  return {
    list: (device: string, query: DirectoryQuery<keyof typeof batchFields> = {}) =>
      api.getApiV1DevicesByDevicePolicyEventBatches(
        transport,
        {
          pathParams: { device },
          query: queryParameters({ limit: 20, ...query, fields: Object.keys(batchFields) }),
        },
        (v) => projectedPage(v, batchFields, undefined, ['id']),
      ),
    read: (device: string, batch: string) =>
      api.getApiV1DevicesByDevicePolicyEventBatchesByBatch(
        transport,
        { pathParams: { device, batch } },
        (value) => {
          const row = projectedRow(value, batchFields)
          if (
            row.id !== batch ||
            row.operationId !== row.request.operationId ||
            row.event !== row.request.event
          )
            throw new Error('Wrong batch')
          return row
        },
      ),
    members: (
      device: string,
      batch: string,
      query: DirectoryQuery<keyof typeof memberFields> = {},
    ) =>
      api.getApiV1DevicesByDevicePolicyEventBatchesByBatchMembers(
        transport,
        {
          pathParams: { device, batch },
          query: queryParameters({ limit: 20, ...query, fields: Object.keys(memberFields) }),
        },
        (value) => {
          const page = projectedPage(value, memberFields, undefined, ['id'])
          for (const item of page.items)
            if (
              item.state !== item.decision.state ||
              JSON.stringify(item.operations.map((o) => o.reference)) !==
                JSON.stringify(item.decision.operations)
            )
              throw new Error('Wrong member operations')
          return page
        },
      ),
  }
}
export type EventBatch = Awaited<ReturnType<ReturnType<typeof createEventsClient>['read']>>
export type EventMember = Awaited<
  ReturnType<ReturnType<typeof createEventsClient>['members']>
>['items'][number]
