import { queryParameters, windowPage, type DirectoryQuery } from '../../../services/directory-query'
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
  unique,
  uuid,
} from '../../../services/decode'
import { jsonObject } from '../../../services/json'
export const eventTypes = [
  'device.registered',
  'device.retired',
  'policy.execution.terminal',
  'compliance.status.changed',
] as const
export function webhookSettings(value: unknown) {
  const v = closed(value, [
      'presentation',
      'endpoint',
      'eventTypes',
      'selection',
      'keyReference',
      'networkReference',
    ]),
    selection = closed(v['selection'], ['kind'], ['ids'])
  const kind = enumeration(selection['kind'], ['allDevices', 'devices', 'groups'] as const)
  closed(selection, kind === 'allDevices' ? ['kind'] : ['kind', 'ids'])
  const endpoint = string(v['endpoint']),
    url = new URL(endpoint)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new Error('Invalid webhook endpoint')
  const presentation = jsonObject(v['presentation'], 65536)
  identifier(presentation['name'])
  return {
    presentation,
    endpoint,
    eventTypes: unique(
      array(v['eventTypes'], (x) => enumeration(x, eventTypes)),
      (x) => x,
    ),
    selection:
      kind === 'allDevices'
        ? { kind }
        : {
            kind,
            ids: unique(array(selection['ids'], kind === 'groups' ? uuid : identifier), (x) => x),
          },
    keyReference: identifier(v['keyReference']),
    networkReference: identifier(v['networkReference']),
  }
}
export function subscription(value: unknown) {
  const v = closed(value, ['id', 'revision', 'targetVersion', 'enabled', 'deleted', 'settings'])
  return {
    id: uuid(v['id']),
    revision: count(v['revision']),
    targetVersion: count(v['targetVersion']),
    enabled: boolean(v['enabled']),
    deleted: boolean(v['deleted']),
    settings: webhookSettings(v['settings']),
  }
}
export type Subscription = ReturnType<typeof subscription>
export function delivery(value: unknown) {
  const v = closed(value, [
    'id',
    'eventId',
    'subscriptionId',
    'targetVersion',
    'sourceDelivery',
    'recoveryVersion',
    'redriveWindowOpen',
    'attempts',
    'status',
    'transportObservation',
    'failureStage',
    'failureReason',
  ])
  return {
    id: uuid(v['id']),
    eventId: uuid(v['eventId']),
    subscriptionId: uuid(v['subscriptionId']),
    targetVersion: count(v['targetVersion']),
    sourceDelivery: nullable(v['sourceDelivery'], uuid),
    recoveryVersion: count(v['recoveryVersion']),
    redriveWindowOpen: boolean(v['redriveWindowOpen']),
    attempts: count(v['attempts']),
    status: identifier(v['status']),
    transportObservation: nullable(v['transportObservation'], identifier),
    failureStage: nullable(v['failureStage'], identifier),
    failureReason: nullable(v['failureReason'], identifier),
  }
}
export type Delivery = ReturnType<typeof delivery>
export type WebhookIntent =
  | {
      kind: 'subscription'
      id: string
      revision: number
      change:
        | { kind: 'put'; value: ReturnType<typeof webhookSettings> }
        | { kind: 'enabled'; value: boolean }
        | { kind: 'delete' }
    }
  | { kind: 'test'; id: string; deviceId: string }
  | { kind: 'replay' | 'redrive'; id: string; expectedVersion: number }
export function createWebhookSubscriptions(transport: HttpTransport) {
  function page(value: unknown) {
    return windowPage(value, delivery)
  }
  return {
    types: () =>
      transport.request({
        method: 'GET',
        path: '/api/v1/webhooks/event-types',
        successStatus: 200,
        decode(value) {
          const v = closed(value, ['items', 'version'])
          if (v['version'] !== 1) throw new Error('Invalid event contract')
          return array(v['items'], (x) => enumeration(x, eventTypes))
        },
      }),
    list: (query: DirectoryQuery = {}) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/webhooks/subscriptions',
        query: queryParameters({ limit: 32, ...query }),
        successStatus: 200,
        decode(value) {
          return windowPage(value, subscription)
        },
      }),
    read: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/webhooks/subscriptions/{id}',
        pathParams: { id },
        successStatus: 200,
        decode(v) {
          const s = subscription(v)
          if (s.id !== id) throw new Error('Wrong subscription')
          return s
        },
      }),
    deliveries: (query: DirectoryQuery = {}) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/webhooks/deliveries',
        query: queryParameters({ limit: 32, ...query }),
        successStatus: 200,
        decode: page,
      }),
    delivery: (id: string) =>
      transport.request({
        method: 'GET',
        path: '/api/v1/webhooks/deliveries/{id}',
        pathParams: { id },
        successStatus: 200,
        decode(value) {
          const v = page(value)
          if (v.items.length !== 1 || v.items[0]?.id !== id) throw new Error('Wrong delivery')
          return v.items[0]
        },
      }),
    async write(operationId: string, input: WebhookIntent): Promise<unknown> {
      if (input.kind === 'subscription')
        return transport.request({
          method: 'PUT',
          path: '/api/v1/webhooks/subscriptions/{id}',
          pathParams: { id: input.id },
          body: { operationId, expectedRevision: input.revision, change: input.change },
          successStatus: 200,
          decode(v) {
            const s = subscription(v)
            if (s.id !== input.id || s.revision !== input.revision + 1)
              throw new Error('Wrong subscription receipt')
            return s
          },
        })
      if (input.kind === 'test')
        return transport.request({
          method: 'POST',
          path: '/api/v1/webhooks/subscriptions/{id}/test',
          pathParams: { id: input.id },
          body: { operationId, deviceId: input.deviceId },
          successStatus: 200,
          decode(value) {
            const v = closed(value, ['id', 'eventId'])
            return { id: uuid(v['id']), eventId: uuid(v['eventId']) }
          },
        })
      return transport.request({
        method: 'POST',
        path: `/api/v1/webhooks/deliveries/{id}/${input.kind}`,
        pathParams: { id: input.id },
        body: {
          operationId,
          ...(input.kind === 'redrive' ? { expectedVersion: input.expectedVersion } : {}),
        },
        successStatus: 200,
        decode(value) {
          if (input.kind === 'redrive') {
            const v = closed(value, ['id', 'operationId', 'status', 'recoveryVersion'])
            if (
              v['id'] !== input.id ||
              v['operationId'] !== operationId ||
              v['status'] !== 'redriven'
            )
              throw new Error('Wrong redrive receipt')
            return {
              id: input.id,
              operationId,
              status: 'redriven',
              recoveryVersion: count(v['recoveryVersion']),
            }
          }
          const v = closed(value, ['id', 'eventId', 'sourceDelivery'])
          if (v['sourceDelivery'] !== input.id) throw new Error('Wrong replay source')
          return {
            id: uuid(v['id']),
            eventId: uuid(v['eventId']),
            sourceDelivery: uuid(v['sourceDelivery']),
          }
        },
      })
    },
  }
}
