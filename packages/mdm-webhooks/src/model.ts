import type { DirectoryQuery, Page } from '@rss/mdm-devices'
import type { Operation } from '@rss/mdm-inventory'

export const eventTypes = [
  'device.registered',
  'device.retired',
  'policy.execution.terminal',
  'compliance.status.changed',
  'device.access.changed',
] as const
export type EventType = (typeof eventTypes)[number]
export type Selection =
  | { readonly kind: 'allDevices' }
  | { readonly kind: 'devices' | 'groups'; readonly ids: readonly string[] }
export interface Settings {
  readonly presentation: Readonly<Record<string, unknown>>
  readonly endpoint: string
  readonly eventTypes: readonly EventType[]
  readonly selection: Selection
  readonly keyReference: string
  readonly networkReference: string
}
export interface Subscription {
  readonly id: string
  readonly revision: number
  readonly targetVersion: number
  readonly enabled: boolean
  readonly deleted: boolean
  readonly settings: Settings
}
export type SubscriptionRow = Pick<Subscription, 'id'> & Partial<Omit<Subscription, 'id'>>
export type SubscriptionChange =
  | { readonly kind: 'put'; readonly value: Settings }
  | { readonly kind: 'enabled'; readonly value: boolean }
  | { readonly kind: 'delete' }
export type DeliveryStatus = 'pending' | 'publishing' | 'published' | 'dead_letter'
export interface Delivery {
  readonly id: string
  readonly eventId: string
  readonly subscriptionId: string
  readonly targetVersion: number
  readonly sourceDelivery: string | null
  readonly recoveryVersion: number
  readonly redriveWindowOpen: boolean
  readonly attempts: number
  readonly status: DeliveryStatus
  readonly transportObservation: 'received' | 'unknown' | 'notSent' | null
  readonly failureStage: string | null
  readonly failureReason: string | null
}
export type DeliveryRow = Pick<Delivery, 'id'> & Partial<Omit<Delivery, 'id'>>
/** Queued event and delivery identity only; no claim of receiver acceptance. */
export interface TestReceipt {
  readonly id: string
  readonly eventId: string
}
export interface ReplayReceipt extends TestReceipt {
  readonly sourceDelivery: string
}
export interface RedriveReceipt {
  readonly id: string
  readonly operationId: string
  readonly status: 'redriven'
  readonly recoveryVersion: number
}
export interface Health {
  /** Tenant-wide aggregation, independently of the reader's visible delivery directory. */
  readonly outbox: readonly {
    readonly domain: 'mdm-webhook-source' | 'mdm-webhook-delivery'
    readonly status: DeliveryStatus
    readonly count: number
  }[]
}
export interface MaterialHead {
  readonly reference: string
  readonly revision: number
  readonly activeRevision: number | null
  readonly retiringRevision: number | null
}
/** Public metadata only. Generated signing secrets have no browser export endpoint. */
export interface Material {
  readonly operationId: string
  readonly reference: string
  readonly revision: number
  readonly configurationSha256: string
  readonly keyDigest: string
  readonly challenge: string
  readonly confirmed: boolean
  readonly revoked: boolean
  readonly endpoint: string | null
  readonly networkReference: string | null
  readonly attemptedAt: number | null
  readonly confirmedAt: number | null
  readonly failureReason: string | null
}
export interface MaterialDirectory {
  readonly configurationSha256: string
  readonly heads: readonly MaterialHead[]
  readonly materials: readonly Material[]
}
export interface MaterialReceipt extends MaterialHead {
  readonly operationId: string
}
export type MaterialOperation = Material | MaterialReceipt
export interface MaterialInput {
  readonly reference: string
  readonly expectedRevision: number
  readonly configurationSha256: string
  readonly endpoint: string
  readonly networkReference: string
  /** This value is request-local, never retained in a public pending intent. */
  readonly source:
    | { readonly kind: 'generate' }
    | { readonly kind: 'import'; readonly secret: string }
}
export type MaterialIntent = Omit<MaterialInput, 'source'> & {
  readonly source: 'generate' | 'import'
}
export interface MaterialTransition {
  readonly reference: string
  readonly expectedRevision: number
  readonly action:
    | { readonly kind: 'activate' | 'revoke'; readonly materialRevision: number }
    | { readonly kind: 'retire_previous' }
}
export interface WebhooksPort {
  subscriptions(query: DirectoryQuery<keyof SubscriptionRow>): Promise<Page<SubscriptionRow>>
  subscription(id: string): Promise<Subscription>
  change(id: string, change: Operation<SubscriptionChange>): Promise<Subscription>
  eventTypes(): Promise<{ readonly version: 1; readonly items: readonly EventType[] }>
  test(id: string, operationId: string, device: string): Promise<TestReceipt>
  deliveries(query: DirectoryQuery<keyof DeliveryRow>): Promise<Page<DeliveryRow>>
  delivery(id: string): Promise<Delivery>
  replay(id: string, operationId: string): Promise<ReplayReceipt>
  redrive(id: string, operationId: string, expectedVersion: number): Promise<RedriveReceipt>
  health(): Promise<Health>
  materials(): Promise<MaterialDirectory>
  materialOperation(id: string): Promise<MaterialOperation>
  prepare(id: string, input: MaterialInput): Promise<Material>
  transition(id: string, input: MaterialTransition): Promise<MaterialReceipt>
}
