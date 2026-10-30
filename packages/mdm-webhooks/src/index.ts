export type * from './model'
export { eventTypes } from './model'
export {
  endpoint,
  fingerprint,
  reference,
  materialIntent,
  validateSettings,
  validateSubscriptionChange,
  validateMaterialInput,
  validateMaterialTransition,
  matchMaterialOperation,
  validatePresentation,
} from './authoring'
import { freeze, identifier, operation, uuid } from '@rss/mdm-inventory'
import type { Operation } from '@rss/mdm-inventory'
import type { DirectoryQuery } from '@rss/mdm-devices'
import type {
  Delivery,
  DeliveryRow,
  MaterialInput,
  MaterialTransition,
  SubscriptionChange,
  SubscriptionRow,
  WebhooksPort,
} from './model'
import {
  validateSubscriptionChange,
  validateMaterialInput,
  validateMaterialTransition,
  materialIntent,
  matchMaterialOperation,
} from './authoring'

/** Explicit tenant use cases. Backend authorization and Outbox execution remain authoritative. */
export function createWebhooks(port: WebhooksPort) {
  return Object.freeze({
    subscriptions: (query: DirectoryQuery<keyof SubscriptionRow> = {}) =>
      port.subscriptions(freeze(query)),
    async subscription(id: string) {
      const value = await port.subscription(uuid(id))
      if (value.id !== id) throw new Error('Wrong webhook subscription')
      return value
    },
    async change(id: string, change: Operation<SubscriptionChange>) {
      uuid(id)
      validateSubscriptionChange(change)
      const original = freeze(change),
        value = await port.change(id, original)
      if (
        value.id !== id ||
        value.revision !== original.expectedRevision + 1 ||
        (original.input.kind === 'delete' && !value.deleted) ||
        (original.input.kind === 'enabled' && value.enabled !== original.input.value) ||
        (!original.expectedRevision && value.enabled)
      )
        throw new Error('Wrong subscription mutation receipt')
      return value
    },
    eventTypes: () => port.eventTypes(),
    async test(id: string, operationId: string, device: string) {
      const value = await port.test(uuid(id), uuid(operationId), identifier(device, 255))
      uuid(value.id)
      uuid(value.eventId)
      return value
    },
    deliveries: (query: DirectoryQuery<keyof DeliveryRow> = {}) => port.deliveries(freeze(query)),
    async delivery(id: string) {
      const value = await port.delivery(uuid(id))
      if (value.id !== id) throw new Error('Wrong webhook delivery')
      return value
    },
    async replay(source: Pick<Delivery, 'id' | 'eventId'>, operationId: string) {
      uuid(source.id)
      uuid(source.eventId)
      const original = freeze(source),
        value = await port.replay(original.id, uuid(operationId))
      uuid(value.id)
      if (
        value.sourceDelivery !== original.id ||
        value.eventId !== original.eventId ||
        value.id === original.id
      )
        throw new Error('Wrong replay delivery receipt')
      return value
    },
    async redrive(source: Pick<Delivery, 'id' | 'recoveryVersion'>, operationId: string) {
      uuid(source.id)
      operation({ operationId, expectedRevision: source.recoveryVersion, input: null })
      if (!source.recoveryVersion) throw new Error('Recovery requires a persisted positive version')
      const original = freeze(source),
        value = await port.redrive(original.id, operationId, original.recoveryVersion)
      if (
        value.id !== original.id ||
        value.operationId !== operationId ||
        value.status !== 'redriven' ||
        value.recoveryVersion !== original.recoveryVersion + 1
      )
        throw new Error('Wrong original delivery recovery receipt')
      return value
    },
    health: () => port.health(),
    materials: () => port.materials(),
    async materialOperation(id: string) {
      const value = await port.materialOperation(uuid(id))
      if (value.operationId !== id) throw new Error('Wrong material operation')
      return value
    },
    async prepare(id: string, input: MaterialInput) {
      uuid(id)
      validateMaterialInput(input)
      const original = freeze(input),
        value = await port.prepare(id, original)
      matchMaterialOperation(id, materialIntent(original), value)
      return value
    },
    async transition(id: string, input: MaterialTransition) {
      uuid(id)
      validateMaterialTransition(input)
      const original = freeze(input),
        value = await port.transition(id, original)
      matchMaterialOperation(id, original, value)
      return value
    },
  })
}
export type Webhooks = ReturnType<typeof createWebhooks>
