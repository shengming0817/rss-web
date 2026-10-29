import * as wireSchemas from '@rss/api/mdm-schemas'
import * as api from '@rss/api/mdm-operations'
import { queryParameters, windowPage, projectedPage, type DirectoryQuery } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import {
  array,
  boolean,
  count,
  identifier,
  nullable,
  string,
  unique,
  uuid,
} from '../../../services/decode'
import { jsonObject } from '../../../services/json'
export function webhookSettings(value: unknown) {
  if (!wireSchemas.getApiV1WebhooksSubscriptionsResponse.validateSettings(value))
    throw new Error('Invalid contract value')

  const v = value,
    selection = v['selection']
  const kind = selection['kind']

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
      array(v['eventTypes'], (x) => x),
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
  if (!wireSchemas.getApiV1WebhooksSubscriptionsByIdResponse.validateRoot(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    id: uuid(v['id']),
    revision: count(v['revision']),
    targetVersion: count(v['targetVersion']),
    enabled: v['enabled'],
    deleted: v['deleted'],
    settings: webhookSettings(v['settings']),
  }
}
export type Subscription = ReturnType<typeof subscription>
export function delivery(value: unknown) {
  if (!wireSchemas.getApiV1WebhooksDeliveriesResponse.validateProjection_Delivery(value))
    throw new Error('Invalid contract value')

  const v = value
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
const subscriptionFields = {
  id: (value: unknown) => uuid(value),
  revision: (value: unknown) => count(value),
  targetVersion: (value: unknown) => count(value),
  enabled: (value: unknown) => boolean(value),
  deleted: (value: unknown) => boolean(value),
  settings: (value: unknown) => webhookSettings(value),
}
const deliveryFields = {
  id: (value: unknown) => uuid(value),
  eventId: (value: unknown) => uuid(value),
  subscriptionId: (value: unknown) => uuid(value),
  targetVersion: (value: unknown) => count(value),
  sourceDelivery: (value: unknown) => nullable(value, uuid),
  recoveryVersion: (value: unknown) => count(value),
  redriveWindowOpen: (value: unknown) => boolean(value),
  attempts: (value: unknown) => count(value),
  status: (value: unknown) => identifier(value),
  transportObservation: (value: unknown) => nullable(value, identifier),
  failureStage: (value: unknown) => nullable(value, identifier),
  failureReason: (value: unknown) => nullable(value, identifier),
}
export function createWebhookSubscriptions(transport: HttpTransport) {
  function page(value: unknown) {
    if (!wireSchemas.getApiV1WebhooksDeliveriesResponse.validateRoot(value))
      throw new Error('Invalid contract value')

    return windowPage(value, delivery)
  }
  return {
    types: () =>
      api.getApiV1WebhooksEventTypes(transport, {}, (value) => {
        const v = value
        if (v['version'] !== 1) throw new Error('Invalid event contract')
        return array(v['items'], (x) => x)
      }),
    list: <F extends keyof typeof subscriptionFields = keyof typeof subscriptionFields>(
      query: DirectoryQuery<F> = {},
    ) =>
      api.getApiV1WebhooksSubscriptions(
        transport,
        { query: queryParameters({ limit: 32, ...query }) },
        (value) => {
          return projectedPage(value, subscriptionFields, query.fields, ['id'])
        },
      ),
    read: (id: string) =>
      api.getApiV1WebhooksSubscriptionsById(transport, { pathParams: { id } }, (v) => {
        const s = subscription(v)
        if (s.id !== id) throw new Error('Wrong subscription')
        return s
      }),
    deliveries: <F extends keyof typeof deliveryFields = keyof typeof deliveryFields>(
      query: DirectoryQuery<F> = {},
    ) =>
      api.getApiV1WebhooksDeliveries(
        transport,
        { query: queryParameters({ limit: 32, ...query }) },
        (value) => projectedPage(value, deliveryFields, query.fields, ['id']),
      ),
    delivery: (id: string) =>
      api.getApiV1WebhooksDeliveriesById(transport, { pathParams: { id } }, (value) => {
        const v = page(value)
        if (v.items.length !== 1 || v.items[0]?.id !== id) throw new Error('Wrong delivery')
        return v.items[0]
      }),
    async write(operationId: string, input: WebhookIntent): Promise<unknown> {
      if (input.kind === 'subscription')
        return api.putApiV1WebhooksSubscriptionsById(
          transport,
          {
            pathParams: { id: input.id },
            body: { operationId, expectedRevision: input.revision, change: input.change },
          },
          (v) => {
            const s = subscription(v)
            if (s.id !== input.id || s.revision !== input.revision + 1)
              throw new Error('Wrong subscription receipt')
            return s
          },
        )
      if (input.kind === 'test')
        return api.postApiV1WebhooksSubscriptionsByIdTest(
          transport,
          { pathParams: { id: input.id }, body: { operationId, deviceId: input.deviceId } },
          (value) => {
            const v = value
            return { id: uuid(v['id']), eventId: uuid(v['eventId']) }
          },
        )
      const project = (value: unknown) => {
        if (input.kind === 'redrive') {
          if (!wireSchemas.postApiV1WebhooksDeliveriesByIdRedriveResponse.validateRoot(value))
            throw new Error('Invalid redrive receipt')
          const v = value
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
        if (!wireSchemas.postApiV1WebhooksDeliveriesByIdReplayResponse.validateRoot(value))
          throw new Error('Invalid replay receipt')
        const v = value
        if (v['sourceDelivery'] !== input.id) throw new Error('Wrong replay source')
        return {
          id: uuid(v['id']),
          eventId: uuid(v['eventId']),
          sourceDelivery: uuid(v['sourceDelivery']),
        }
      }
      return input.kind === 'redrive'
        ? api.postApiV1WebhooksDeliveriesByIdRedrive(
            transport,
            {
              pathParams: { id: input.id },
              body: { operationId, expectedVersion: input.expectedVersion },
            },
            project,
          )
        : api.postApiV1WebhooksDeliveriesByIdReplay(
            transport,
            { pathParams: { id: input.id }, body: { operationId } },
            project,
          )
    },
  }
}
