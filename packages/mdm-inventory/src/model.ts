import type {
  Channel,
  Association,
  DeviceRef,
  DirectoryQuery,
  FieldState,
  Page,
  Platform,
  Scalar,
  WindowQuery,
  ViewEndpoint,
} from '@rss/mdm-devices'

/** Opaque committed input issued by the backend; never a numeric frontier. */
export interface AssetCut {
  readonly tenant: string
  readonly epoch: string
  readonly snapshot: string
}
/** Asset values and their source coordinates are facts, never client-side resolution. */
export type AssetContext = 'endpoint' | 'associated_device'
export type InventorySource =
  | 'manual'
  | 'mdm.windows'
  | 'mdm.apple'
  | 'agent.builtin'
  | 'agent.script'
  | 'agent.native'
  | 'agent.osquery'
export type LocalAccount =
  | { readonly kind: 'windows'; readonly sid: string }
  | { readonly kind: 'macos'; readonly uid: number; readonly generated_uid: string }
/** A concrete observed namespace, distinct from a collection template's scope. */
export type CollectionScope =
  | { readonly kind: 'device' }
  | { readonly kind: 'native_user'; readonly owner: LocalAccount }
  | { readonly kind: 'apple_user'; readonly identity: string }
  | {
      readonly kind: 'native_certificates'
      readonly platform: Platform
      readonly store: string
      readonly owner: LocalAccount | null
    }
  | {
      readonly kind: 'native_application'
      readonly platform: Platform
      readonly identity: string
      readonly owner: LocalAccount | null
    }
  | {
      readonly kind: 'native_accounts'
      readonly platform: Platform
      readonly identities: readonly string[]
    }
  | {
      readonly kind: 'macos_applications'
      readonly root: 'local' | 'system' | 'user'
      readonly uid: number | null
    }
  | {
      readonly kind: 'macos_brew'
      readonly package: 'formula' | 'cask'
      readonly prefix: string
      readonly taps: readonly string[]
      readonly uid: number
    }
export interface Evidence {
  readonly scope: CollectionScope
  readonly source: InventorySource
  readonly dataset: string | null
  readonly registration: string | null
  readonly registrationGeneration: number | null
  readonly epoch: string | null
  readonly snapshotId: string
  readonly observedAt: number
  readonly receivedAt: number
  readonly actor: string | null
}
export interface SourceFact {
  readonly state: FieldState
  readonly evidence: Evidence
  readonly lastKnown: { readonly value: Scalar; readonly evidence: Evidence } | null
}
export interface ResolvedField {
  readonly field: string
  readonly state: FieldState
  readonly sources: readonly SourceFact[]
}
export type ListState =
  | { readonly kind: 'known'; readonly count: number; readonly digest: string }
  | {
      readonly kind: 'unknown'
      readonly reason: 'unordered_conflict' | 'incomplete' | 'native_status' | 'evidence_limit'
    }
  | { readonly kind: 'null' | 'missing' | 'deleted' | 'unsupported' | 'conflict' }
export interface ListSummary {
  readonly state: ListState
  readonly cursor: string
  readonly itemKey: string | null
  readonly sources: readonly {
    readonly state: ListState
    readonly cursor: string
    readonly evidence: Evidence
  }[]
}
export type ValueType =
  | { readonly kind: 'string'; readonly allowEmpty: boolean; readonly maxLength: number }
  | { readonly kind: 'enum'; readonly values: readonly string[] }
  | { readonly kind: 'integer' | 'number' | 'boolean' | 'time' }
  | { readonly kind: 'array'; readonly maxItems: number; readonly items: ValueType }
  | { readonly kind: 'object'; readonly properties: Readonly<Record<string, ValueType>> }
  | {
      readonly kind: 'record'
      readonly properties: Readonly<
        Record<string, { readonly required: boolean; readonly valueType: ValueType }>
      >
    }
export interface TimeSeriesBinding {
  readonly kind: 'gauge' | 'cumulative_counter' | 'delta_counter' | 'state'
  readonly valuePath: readonly string[]
  readonly intervalStartPath: readonly string[] | null
  readonly dimensions: Readonly<
    Record<string, { readonly path: readonly string[]; readonly values: readonly string[] }>
  >
  readonly aggregations: readonly (
    | 'min'
    | 'max'
    | 'sum'
    | 'count'
    | 'mean'
    | 'increase'
    | 'rate'
    | 'timeline'
    | 'transitions'
    | 'coverage'
  )[]
  readonly retention: { readonly key: string; readonly revision: number }
  readonly maxResources: number
}
export interface FieldDefinition {
  readonly key: string
  readonly version: number
  readonly valueType: ValueType
  readonly nullable: boolean
  readonly manual: boolean
  readonly sources: Readonly<Record<string, number>>
  readonly platforms: readonly Platform[]
  readonly sensitivity: 'standard' | 'sensitive' | 'secret'
  readonly unit: string | null
  readonly searchable: boolean
  readonly itemKey: string | null
  readonly timeSeries: TimeSeriesBinding | null
}
export const operators = [
  'eq',
  'ne',
  'in',
  'not_in',
  'lt',
  'le',
  'gt',
  'ge',
  'contains',
  'not_contains',
  'contains_any',
  'contains_all',
  'is_null',
  'is_not_null',
] as const
export type Operator = (typeof operators)[number]
export interface FieldDescriptor extends FieldDefinition {
  readonly operations: readonly Operator[]
}
export interface FieldRow extends Partial<FieldDescriptor> {
  readonly key: string
}
export interface FieldCatalog extends Page<FieldRow> {
  readonly dictionary: string
}
export interface FieldDetail {
  readonly field: string
  readonly version: number
  readonly definition: FieldDefinition | null
}
export interface FieldReference {
  readonly source:
    | { readonly kind: 'group' | 'compliance_rule'; readonly id: string; readonly revision: number }
    | { readonly kind: 'resource_version'; readonly id: string; readonly version: string }
    | {
        readonly kind: 'saved_query'
        readonly instance: string
        readonly owner: string
        readonly id: string
        readonly revision: number
      }
  readonly role:
    | 'group_condition'
    | 'collection_mapping'
    | 'telemetry_mapping'
    | 'compliance_condition'
    | 'saved_query'
  readonly release: 'edit_or_delete_referencing_object' | 'archive_referencing_version'
}
export type FieldReferences = Page<FieldReference>
export interface DisplayGroup {
  readonly id: string
  readonly name: string
  readonly fields: readonly string[]
}
export interface FieldLayout {
  readonly revision: number
  readonly editable: boolean
  readonly groups: readonly DisplayGroup[]
}

export type ScopeSelector =
  | { readonly kind: 'device' | 'all_authorized' }
  | { readonly kind: 'exact'; readonly scope: CollectionScope }
  | { readonly kind: 'local_user'; readonly platform: Platform; readonly identity: string }
export interface ConditionContext {
  readonly selector: ScopeSelector
  readonly quantifier: 'one' | 'any' | 'all'
}
export type ConditionValue = Extract<
  Scalar,
  { readonly kind: 'string' | 'integer' | 'number' | 'boolean' | 'time' }
>
export interface Predicate {
  readonly kind: 'predicate'
  readonly field: string
  readonly op: Operator
  readonly value?: ConditionValue
  readonly values?: readonly ConditionValue[]
}
export type Criteria =
  | Predicate
  | { readonly kind: 'and' | 'or'; readonly children: readonly Criteria[] }
export interface Condition extends ConditionContext {
  readonly criteria: Criteria
}
export interface QueryDefinition {
  readonly filter: string | null
  readonly scope: ConditionContext
  readonly fields: readonly string[]
  readonly sort: readonly { readonly field: string; readonly descending: boolean }[]
}
export interface Summary {
  readonly total: number
  readonly matched: number
  readonly unknown: number
}
export interface QueryAccepted {
  readonly task: string
  readonly statusUrl: string
}
export interface QueryStatus {
  readonly task: string
  readonly status: 'pending' | 'running' | 'completed' | 'failed'
  readonly summary: Summary
  readonly resultUrl: string | null
  readonly failure: string | null
}
export interface FixedResult extends Page<InventoryView> {
  readonly snapshot: string
  readonly summary: Summary
}
export interface SavedQuery {
  readonly id: string
  readonly revision: number
  readonly definition: { readonly name: string; readonly query: QueryDefinition } | null
}
export interface SavedQueryRow extends Partial<SavedQuery> {
  readonly id: string
  readonly name?: string | null
  readonly deleted?: boolean
}
export interface Operation<T> {
  readonly operationId: string
  readonly expectedRevision: number
  readonly input: T
}
export type FieldChange =
  | { readonly action: 'put'; readonly definition: FieldDefinition }
  | { readonly action: 'delete' }
export type SavedQueryChange =
  | { readonly action: 'put'; readonly definition: NonNullable<SavedQuery['definition']> }
  | { readonly action: 'delete' }
export type ManualChange =
  | { readonly action: 'set'; readonly value: Scalar }
  | { readonly action: 'null' | 'delete' }
export type Quality =
  | 'unknown'
  | 'pending'
  | 'success'
  | 'unsupported'
  | 'failed'
  | 'invalid'
  | 'missing'
  | 'deleted'
export interface QualityField {
  readonly field: string
  readonly scope: CollectionScope
  readonly quality: Quality
  readonly status: number | null
  readonly reason: string | null
  readonly itemCount: number
  readonly invalidItems: number
  readonly receivedAt: number | null
}
export interface Coverage {
  readonly id: string
  readonly version: string
  readonly definition: string
  readonly format: string
}
export interface QualityRun {
  readonly channel: Channel
  readonly source: InventorySource
  readonly runId: string
  readonly registration: string
  readonly registrationGeneration: number
  readonly epoch: string
  readonly sequence: number
  readonly dataset: string
  readonly templateVersion: string
  readonly fingerprint: string
  readonly coverage: Coverage
  readonly complete: boolean
  readonly result: 'pending' | 'snapshot' | 'partial' | 'failed'
  readonly deliveryPending: boolean
  readonly fields: readonly QualityField[]
}
export interface InventoryView {
  readonly device: string
  readonly collectionScope: CollectionScope
  readonly channels: readonly Channel[]
  readonly fields: Readonly<Record<string, ResolvedField>>
  readonly lists: Readonly<Record<string, ListSummary>>
  readonly quality: readonly QualityRun[]
  readonly revisions: Readonly<Record<string, number>>
}
export interface AssetView {
  readonly reference: DeviceRef
  readonly association: Association | null
  readonly endpoints: readonly ViewEndpoint[]
  readonly fields: Readonly<
    Record<
      string,
      {
        readonly field: string
        readonly state: FieldState
        readonly sources: readonly { readonly endpoint: string; readonly fact: SourceFact }[]
      }
    >
  >
  readonly lists: Readonly<
    Record<
      string,
      {
        readonly state: ListState
        readonly itemKey: string | null
        readonly sources: readonly {
          readonly endpoint: string
          readonly cursor: string
          readonly state: ListState
          readonly evidence: Evidence
          readonly lastKnown: { readonly state: ListState; readonly evidence: Evidence } | null
        }[]
      }
    >
  >
  readonly inventorySources: readonly {
    readonly endpoint: string
    readonly quality: readonly QualityRun[]
    readonly revisions: Readonly<Record<string, number>>
  }[]
}
export interface CollectionRun {
  readonly id: string
  readonly registration: string
  readonly generation: number
  readonly epoch: string
  readonly source: InventorySource
  readonly dataset: string
  readonly templateVersion: string
  readonly fingerprint: string
  readonly sequence: number
  readonly coverage: Coverage
  readonly complete: boolean
  readonly result: QualityRun['result']
  readonly deliveryPending: boolean
  readonly fields: readonly QualityField[]
  readonly startedAt: number
  readonly finishedAt: number | null
  readonly reason:
    | 'complete'
    | 'message_budget'
    | 'aborted'
    | 'timeout'
    | 'superseded'
    | 'revoked'
    | null
  readonly delivery: {
    readonly projection: 'projected' | 'pending' | 'pending_receipt' | 'not_applicable'
    readonly receipt: DeliveryReceipt | null
  }
}
export type SnapshotNeed =
  | 'missingBaseline'
  | 'baselineMismatch'
  | 'gap'
  | 'baselineExpired'
  | 'partial'
  | 'collectionFailed'
export interface ProjectionState {
  readonly version: 1
  readonly revision: number
  readonly baseline: {
    readonly coverage: Coverage
    readonly expiresAt: number
    readonly id: string
  } | null
  readonly cursor: number | null
  readonly highWater: number | null
  readonly need: SnapshotNeed | null
}
export interface DeliveryReceipt {
  readonly batch_id: string
  readonly received_at: number
  readonly decision: {
    readonly version: 1
    readonly before: ProjectionState
    readonly after: ProjectionState
    readonly outcome: 'snapshot' | 'delta' | 'stale' | { readonly needSnapshot: SnapshotNeed }
  }
}
export interface ListItems extends Page<Scalar> {
  readonly reference: DeviceRef
  readonly endpoint: string
  readonly source: Evidence | null
  readonly field: string
  readonly total: number
  readonly assetCut: AssetCut | null
}
export interface ListRead {
  readonly reference: DeviceRef
  readonly endpoint: string
  readonly field: string
  readonly scope: CollectionScope
  readonly cursor: string
  readonly limit?: number
}
export interface CollectionItems extends Page<{
  readonly index: number
  readonly quality: Quality
  readonly value: Scalar | null
}> {
  readonly run: string
  readonly field: string
}

/** Operations are explicit; session, HTTP, polling and write recovery stay with their owners. */
export interface InventoryPort {
  fields(query: DirectoryQuery<keyof FieldDescriptor>): Promise<FieldCatalog>
  field(key: string): Promise<FieldDetail>
  references(key: string, query: WindowQuery): Promise<FieldReferences>
  putField(key: string, change: Operation<FieldChange>): Promise<FieldDetail>
  layout(): Promise<FieldLayout>
  putLayout(
    change: Operation<{ readonly groups: readonly DisplayGroup[] }>,
  ): Promise<{ readonly revision: number }>
  query(operationId: string, definition: QueryDefinition): Promise<QueryAccepted>
  queryStatus(task: string, signal?: AbortSignal): Promise<QueryStatus>
  queryItems(task: string, query: WindowQuery, signal?: AbortSignal): Promise<FixedResult>
  facets(
    task: string,
    facet: 'os_versions' | 'channels' | 'asset_states',
    query: WindowQuery,
    signal?: AbortSignal,
  ): Promise<Page<{ readonly label: string; readonly total: number }>>
  savedQueries(query: DirectoryQuery<keyof SavedQueryRow>): Promise<Page<SavedQueryRow>>
  savedQuery(id: string): Promise<SavedQuery>
  putSavedQuery(id: string, change: Operation<SavedQueryChange>): Promise<SavedQuery>
  executeSavedQuery(id: string, change: Operation<Record<string, never>>): Promise<QueryAccepted>
  inventory(device: string, scope: CollectionScope): Promise<InventoryView>
  view(reference: DeviceRef, signal?: AbortSignal): Promise<AssetView>
  scopes(
    device: string,
    query: WindowQuery,
  ): Promise<
    Page<{ readonly scope: CollectionScope }> & {
      readonly device: string
      readonly assetCut: AssetCut
    }
  >
  list(query: ListRead, signal?: AbortSignal): Promise<ListItems>
  collection(device: string, run: string, scope: CollectionScope): Promise<CollectionRun>
  collectionItems(
    device: string,
    run: string,
    field: string,
    scope: CollectionScope,
    query: WindowQuery,
  ): Promise<CollectionItems>
  assign(
    device: string,
    field: string,
    change: Operation<ManualChange>,
  ): Promise<{ readonly device: string; readonly field: string; readonly revision: number }>
}
