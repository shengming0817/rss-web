import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  closed,
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
} from '@rss/api/mdm-query'
import { jsonValue } from '../../../services/json'
import { policyName } from './model'
export function operationReference(value: unknown) {
  const v = closed(value, ['kind', 'id'])
  return {
    kind: enumeration(v['kind'], ['run', 'native', 'retirement'] as const),
    id: uuid(v['id']),
  }
}
export function eventDecision(value: unknown) {
  const state = enumeration(record(value)['state'], [
    'pending',
    'accepted',
    'no_change',
    'rejected',
    'expired',
  ] as const)
  const v = closed(
    value,
    state === 'accepted'
      ? ['state', 'operations']
      : state === 'no_change' || state === 'rejected'
        ? ['state', 'reason']
        : ['state'],
  )
  return {
    state,
    operations: state === 'accepted' ? array(v['operations'], operationReference) : [],
    reason: state === 'no_change' || state === 'rejected' ? identifier(v['reason']) : null,
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
    const v = closed(value, ['operationId', 'event', 'source', 'executionContext'])
    const source = record(v['source']),
      kind = enumeration(source['kind'], ['human', 'ai', 'policy'] as const)
    closed(source, kind === 'policy' ? ['kind', 'runId'] : ['kind'])
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
      const o = closed(value, ['reference', 'state', 'allowedActions'], ['agentInstallation']),
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
      transport.request({
        method: 'GET',
        path: '/api/v1/devices/{device}/policy-event-batches',
        pathParams: { device },
        query: queryParameters({ limit: 20, ...query }),
        successStatus: 200,
        decode: (v) => projectedPage(v, batchFields, query.fields, ['id']),
      }),
    read: (device: string, batch: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/devices/{device}/policy-event-batches/{batch}',
        pathParams: { device, batch },
        successStatus: 200,
        decode(value) {
          const row = projectedRow(value, batchFields)
          if (
            row.id !== batch ||
            row.operationId !== row.request.operationId ||
            row.event !== row.request.event
          )
            throw new Error('Wrong batch')
          return row
        },
      }),
    members: (
      device: string,
      batch: string,
      query: DirectoryQuery<keyof typeof memberFields> = {},
    ) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/devices/{device}/policy-event-batches/{batch}/members',
        pathParams: { device, batch },
        query: queryParameters({ limit: 20, ...query }),
        successStatus: 200,
        decode(value) {
          const page = projectedPage(value, memberFields, query.fields, ['id'])
          for (const item of page.items)
            if (
              ('state' in item && 'decision' in item && item.state !== item.decision.state) ||
              ('operations' in item &&
                'decision' in item &&
                JSON.stringify(item.operations.map((o) => o.reference)) !==
                  JSON.stringify(item.decision.operations))
            )
              throw new Error('Wrong member operations')
          return page
        },
      }),
  }
}
export type EventBatch = Awaited<ReturnType<ReturnType<typeof createEventsClient>['read']>>
export type EventMember = Awaited<
  ReturnType<ReturnType<typeof createEventsClient>['members']>
>['items'][number]
