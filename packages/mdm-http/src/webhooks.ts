import * as api from '@rss/api/mdm-operations'
import * as schema from '@rss/api/mdm-schemas'
import { projectedPage, projectedRow, queryParameters } from '@rss/api/mdm-query'
import type { HttpTransport } from '@rss/api/mdm'
import {
  eventTypes,
  fingerprint,
  validateSettings,
  type Delivery,
  type Material,
  type MaterialHead,
  type MaterialOperation,
  type MaterialReceipt,
  type Settings,
  type Subscription,
  type WebhooksPort,
} from '@rss/mdm-webhooks'
import { boolean, count, enumeration, list, nullable, positive, text, uuid } from './decode'
import { distinct, integer, requestInput } from './inventory-values'

function settings(value: unknown): Settings {
  if (!schema.getApiV1WebhooksSubscriptionsResponse.validateSettings(value))
    throw new Error('Invalid webhook settings')
  const selection = value.selection
  const result: Settings = {
    presentation: structuredClone(value.presentation),
    endpoint: text(value.endpoint),
    eventTypes: value.eventTypes.map((event) => enumeration(event, eventTypes)),
    selection:
      selection.kind === 'allDevices'
        ? { kind: 'allDevices' }
        : { kind: selection.kind, ids: [...selection.ids] },
    keyReference: text(value.keyReference),
    networkReference: text(value.networkReference),
  }
  validateSettings(result)
  return result
}
const subscriptionFields = {
  id: uuid,
  revision: positive,
  targetVersion: positive,
  enabled: boolean,
  deleted: boolean,
  settings,
}
function subscription(value: unknown, id: string): Subscription {
  if (!schema.getApiV1WebhooksSubscriptionsByIdResponse.validateRoot(value))
    throw new Error('Invalid subscription detail')
  const result = projectedRow(value, subscriptionFields)
  if (result.id !== id) throw new Error('Wrong subscription detail')
  return result
}
const deliveryStatus = (value: unknown) =>
  enumeration(value, ['pending', 'publishing', 'published', 'dead_letter'] as const)
const deliveryFields = {
  id: uuid,
  eventId: uuid,
  subscriptionId: uuid,
  targetVersion: positive,
  sourceDelivery: (value: unknown) => nullable(value, uuid),
  recoveryVersion: positive,
  redriveWindowOpen: boolean,
  attempts: count,
  status: deliveryStatus,
  transportObservation: (value: unknown) =>
    nullable(value, (v) => enumeration(v, ['received', 'unknown', 'notSent'] as const)),
  failureStage: (value: unknown) => nullable(value, text),
  failureReason: (value: unknown) => nullable(value, text),
}
function delivery(value: unknown, id: string): Delivery {
  if (!schema.getApiV1WebhooksDeliveriesByIdResponse.validateRoot(value))
    throw new Error('Invalid delivery detail')
  const page = projectedPage(value, deliveryFields, undefined, ['id'])
  if (page.items.length !== 1 || page.items[0]!.id !== id || page.nextCursor !== null)
    throw new Error('Wrong exact delivery')
  return page.items[0]!
}
function material(value: unknown): Material {
  if (!schema.postApiV1WebhooksMaterialsResponse.validateRoot(value))
    throw new Error('Invalid public signing material')
  return {
    operationId: uuid(value.operationId),
    reference: text(value.reference),
    revision: positive(value.revision),
    configurationSha256: fingerprint(text(value.configurationSha256)),
    keyDigest: fingerprint(text(value.keyDigest)),
    challenge: text(value.challenge),
    confirmed: boolean(value.confirmed),
    revoked: boolean(value.revoked),
    endpoint: nullable(value.endpoint, text),
    networkReference: nullable(value.networkReference, text),
    attemptedAt: nullable(value.attemptedAt, integer),
    confirmedAt: nullable(value.confirmedAt, integer),
    failureReason: nullable(value.failureReason, text),
  }
}
function head(value: unknown): MaterialHead {
  if (!schema.getApiV1WebhooksMaterialsResponse.validateHead(value))
    throw new Error('Invalid signing material head')
  return {
    reference: text(value.reference),
    revision: positive(value.revision),
    activeRevision: nullable(value.activeRevision, positive),
    retiringRevision: nullable(value.retiringRevision, positive),
  }
}
function receipt(value: unknown): MaterialReceipt {
  if (!schema.postApiV1WebhooksMaterialsTransitionsResponse.validateRoot(value))
    throw new Error('Invalid material transition receipt')
  return {
    operationId: uuid(value.operationId),
    ...head({
      reference: value.reference,
      revision: value.revision,
      activeRevision: value.activeRevision,
      retiringRevision: value.retiringRevision,
    }),
  }
}
function original(value: unknown, id: string): MaterialOperation {
  if (
    !schema.getApiV1WebhooksMaterialsOperationsByIdResponse.validateRoot(value) ||
    value.operationId !== id
  )
    throw new Error('Wrong material operation')
  return 'configurationSha256' in value ? material(value) : receipt(value)
}
/** All wire and HTTP semantics stay here; business pages use the one injected session binding. */
export function createWebhooksAdapter(transport: HttpTransport): WebhooksPort {
  return {
    subscriptions: (query) =>
      api.getApiV1WebhooksSubscriptions(
        transport,
        { query: queryParameters({ limit: 32, ...query }) },
        (value) => projectedPage(value, subscriptionFields, query.fields, ['id']),
      ),
    subscription: (id) =>
      api.getApiV1WebhooksSubscriptionsById(transport, { pathParams: { id } }, (value) =>
        subscription(value, id),
      ),
    change: (id, change) =>
      api.putApiV1WebhooksSubscriptionsById(
        transport,
        {
          pathParams: { id },
          body: requestInput(
            {
              operationId: change.operationId,
              expectedRevision: change.expectedRevision,
              change: change.input,
            },
            schema.putApiV1WebhooksSubscriptionsByIdBody.validateRoot,
          ),
        },
        (value) => subscription(value, id),
      ),
    eventTypes: () =>
      api.getApiV1WebhooksEventTypes(transport, {}, (value) => {
        if (!schema.getApiV1WebhooksEventTypesResponse.validateRoot(value))
          throw new Error('Invalid webhook event catalog')
        const items = value.items.map((event) => enumeration(event, eventTypes))
        distinct(items, (item) => item)
        return { version: 1, items }
      }),
    test: (id, operationId, device) =>
      api.postApiV1WebhooksSubscriptionsByIdTest(
        transport,
        {
          pathParams: { id },
          body: requestInput(
            { operationId, deviceId: device },
            schema.postApiV1WebhooksSubscriptionsByIdTestBody.validateRoot,
          ),
        },
        (value) => {
          if (!schema.postApiV1WebhooksSubscriptionsByIdTestResponse.validateRoot(value))
            throw new Error('Invalid queued test receipt')
          return { id: uuid(value.id), eventId: uuid(value.eventId) }
        },
      ),
    deliveries: (query) =>
      api.getApiV1WebhooksDeliveries(
        transport,
        { query: queryParameters({ limit: 32, ...query }) },
        (value) => projectedPage(value, deliveryFields, query.fields, ['id']),
      ),
    delivery: (id) =>
      api.getApiV1WebhooksDeliveriesById(transport, { pathParams: { id } }, (value) =>
        delivery(value, id),
      ),
    replay: (id, operationId) =>
      api.postApiV1WebhooksDeliveriesByIdReplay(
        transport,
        {
          pathParams: { id },
          body: requestInput(
            { operationId },
            schema.postApiV1WebhooksDeliveriesByIdReplayBody.validateRoot,
          ),
        },
        (value) => {
          if (
            !schema.postApiV1WebhooksDeliveriesByIdReplayResponse.validateRoot(value) ||
            value.sourceDelivery !== id
          )
            throw new Error('Wrong replay receipt')
          return {
            id: uuid(value.id),
            eventId: uuid(value.eventId),
            sourceDelivery: uuid(value.sourceDelivery),
          }
        },
      ),
    redrive: (id, operationId, expectedVersion) =>
      api.postApiV1WebhooksDeliveriesByIdRedrive(
        transport,
        {
          pathParams: { id },
          body: requestInput(
            { operationId, expectedVersion },
            schema.postApiV1WebhooksDeliveriesByIdRedriveBody.validateRoot,
          ),
        },
        (value) => {
          if (
            !schema.postApiV1WebhooksDeliveriesByIdRedriveResponse.validateRoot(value) ||
            value.id !== id ||
            value.operationId !== operationId ||
            value.status !== 'redriven'
          )
            throw new Error('Wrong redrive receipt')
          return {
            id: uuid(value.id),
            operationId: uuid(value.operationId),
            status: 'redriven',
            recoveryVersion: positive(value.recoveryVersion),
          }
        },
      ),
    health: () =>
      api.getApiV1WebhooksHealth(transport, {}, (value) => {
        if (!schema.getApiV1WebhooksHealthResponse.validateRoot(value))
          throw new Error('Invalid webhook health')
        return {
          outbox: distinct(
            value.outbox.map((row) => ({
              domain: row.domain,
              status: row.status,
              count: count(row.count),
            })),
            (row) => JSON.stringify([row.domain, row.status]),
          ),
        }
      }),
    materials: () =>
      api.getApiV1WebhooksMaterials(transport, {}, (value) => {
        if (!schema.getApiV1WebhooksMaterialsResponse.validateRoot(value))
          throw new Error('Invalid material directory')
        return {
          configurationSha256: fingerprint(text(value.configurationSha256)),
          heads: distinct(list(value.keys.heads, head, 128), (row) => row.reference),
          materials: distinct(list(value.keys.materials, material, 4096), (row) =>
            JSON.stringify([row.reference, row.revision]),
          ),
        }
      }),
    materialOperation: (id) =>
      api.getApiV1WebhooksMaterialsOperationsById(transport, { pathParams: { id } }, (value) =>
        original(value, id),
      ),
    prepare: (id, input) =>
      api.postApiV1WebhooksMaterials(
        transport,
        {
          headers: { 'Idempotency-Key': id },
          body: requestInput(input, schema.postApiV1WebhooksMaterialsBody.validateRoot),
        },
        (value) => {
          const result = material(value)
          if (result.operationId !== id) throw new Error('Wrong material preparation receipt')
          return result
        },
      ),
    transition: (id, input) =>
      api.postApiV1WebhooksMaterialsTransitions(
        transport,
        {
          headers: { 'Idempotency-Key': id },
          body: requestInput(input, schema.postApiV1WebhooksMaterialsTransitionsBody.validateRoot),
        },
        (value) => {
          const result = receipt(value)
          if (result.operationId !== id) throw new Error('Wrong material transition receipt')
          return result
        },
      ),
  }
}
