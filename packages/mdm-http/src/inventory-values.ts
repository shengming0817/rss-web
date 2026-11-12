import * as schema from '@rss/api/mdm-schemas'
import type { FieldState, Scalar } from '@rss/mdm-devices'
import { validateScalar } from '@rss/mdm-inventory'
import type {
  CollectionScope,
  AssetCut,
  Condition,
  ConditionContext,
  ConditionValue,
  Criteria,
  Evidence,
  FieldDefinition,
  FieldDescriptor,
  InventoryView,
  ListState,
  LocalAccount,
  QualityRun,
  ResolvedField,
  SourceFact,
} from '@rss/mdm-inventory'
import { count, nullable, record, text, uuid } from './decode'

/** Generated protocol admission stays in this adapter; authoring has its own domain model. */
export function requestInput<T>(value: unknown, validate: (input: unknown) => input is T): T {
  if (!validate(value)) throw { cause: 'client', code: 'invalid_input' }
  return value
}
export function scalar(value: unknown): Scalar {
  if (!schema.getApiV1DevicesByIdInventoryResponse200.validateScalar(value))
    throw new Error('Invalid asset value')
  validateScalar(value)
  return value
}
export function state(value: unknown): FieldState {
  if (!schema.getApiV1DevicesByIdInventoryResponse200.validateState(value))
    throw new Error('Invalid asset state')
  return value.kind === 'known' ? { kind: 'known', value: scalar(value.value) } : value
}
export function scope(value: unknown): CollectionScope {
  if (!schema.getApiV1DevicesByIdInventoryResponse200.validateCollectionScope(value))
    throw new Error('Invalid asset namespace')
  switch (value.kind) {
    case 'device':
      return { kind: value.kind }
    case 'apple_user':
      return { kind: value.kind, identity: value.identity }
    case 'native_user':
      return { kind: value.kind, owner: localAccount(value.owner) }
    case 'native_accounts':
      return { kind: value.kind, platform: value.platform, identities: [...value.identities] }
    case 'native_application':
      return {
        kind: value.kind,
        platform: value.platform,
        identity: value.identity,
        owner: value.owner === null ? null : localAccount(value.owner),
      }
    case 'native_certificates':
      return {
        kind: value.kind,
        platform: value.platform,
        store: value.store,
        owner: value.owner === null ? null : localAccount(value.owner),
      }
    case 'macos_applications':
      return { kind: value.kind, root: value.root, uid: value.uid }
    case 'macos_brew':
      return {
        kind: value.kind,
        prefix: value.prefix,
        package: value.package,
        uid: value.uid,
        taps: [...value.taps],
      }
  }
}
function localAccount(value: LocalAccount): LocalAccount {
  return value.kind === 'windows'
    ? { kind: 'windows', sid: value.sid }
    : { kind: 'macos', uid: value.uid, generated_uid: value.generated_uid }
}
export function inventoryListState(value: unknown): ListState {
  if (!schema.getApiV1DevicesByIdInventoryResponse200.validateListState(value))
    throw new Error('Invalid inventory list state')
  return value.kind === 'known'
    ? { kind: 'known', count: count(value.count), digest: value.digest }
    : value
}
export function viewListState(value: unknown): ListState {
  if (!schema.getApiV1DeviceViewsByKindByIdResponse.validateListState(value))
    throw new Error('Invalid view list state')
  if (value.kind === 'unknown') return { kind: 'unknown', reason: value.value.reason }
  return value.kind === 'known'
    ? { kind: 'known', count: count(value.count), digest: value.digest }
    : value
}
export function evidence(value: unknown): Evidence {
  if (!schema.getApiV1DevicesByIdInventoryResponse200.validateEvidence(value))
    throw new Error('Invalid evidence coordinates')
  return {
    ...value,
    scope: scope(value.scope),
    observedAt: integer(value.observedAt),
    receivedAt: integer(value.receivedAt),
  }
}
export function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new Error('Unsafe asset integer')
  return value
}
export function assetCut(value: unknown): AssetCut {
  if (!schema.getApiV1DevicesByIdInventoryResponse200.validateAssetCut(value))
    throw new Error('Invalid asset cut')
  return { ...value, tenant: uuid(value.tenant), epoch: uuid(value.epoch) }
}
function sourceFact(value: unknown): SourceFact {
  if (!schema.getApiV1DevicesByIdInventoryResponse200.validateSourceFact(value))
    throw new Error('Invalid source fact')
  return {
    state: state(value.state),
    evidence: evidence(value.evidence),
    lastKnown:
      value.lastKnown === null
        ? null
        : { value: scalar(value.lastKnown.value), evidence: evidence(value.lastKnown.evidence) },
  }
}
export function resolvedField(value: unknown): ResolvedField {
  if (!schema.getApiV1DevicesByIdInventoryResponse200.validateResolvedField(value))
    throw new Error('Invalid resolved field')
  return { field: value.field, state: state(value.state), sources: value.sources.map(sourceFact) }
}
export function fieldDefinition(value: unknown): FieldDefinition {
  if (!schema.getApiV1AssetFieldsByFieldResponse200.validateFieldDefinition(value))
    throw new Error('Invalid field definition')
  count(value.version)
  return structuredClone(value)
}
export function fieldDescriptor(value: unknown): FieldDescriptor {
  if (!schema.getApiV1AssetFieldsResponse.validateFieldView(value))
    throw new Error('Invalid field descriptor')
  count(value.version)
  return structuredClone(value)
}
export function conditionContext(value: unknown): ConditionContext {
  if (!schema.getApiV1DevicesByIdInventoryResponse200.validateQueryScope(value))
    throw new Error('Invalid condition context')
  const selector = value.selector
  return {
    selector:
      selector.kind === 'exact'
        ? { kind: 'exact', scope: scope(selector.scope) }
        : structuredClone(selector),
    quantifier: value.quantifier,
  }
}
export function conditionValue(value: unknown): ConditionValue {
  const decoded = scalar(value)
  if (decoded.kind === 'array' || decoded.kind === 'object')
    throw new Error('Structured condition operand')
  return decoded
}
export function criteria(value: unknown): Criteria {
  if (!schema.getApiV1ComplianceRulesByIdResponse.validateCriteria(value))
    throw new Error('Invalid condition criteria')
  if (value.kind === 'and' || value.kind === 'or')
    return { kind: value.kind, children: value.children.map(criteria) }
  return {
    kind: 'predicate',
    field: value.field,
    op: value.op,
    ...(value.value == null ? {} : { value: conditionValue(value.value) }),
    ...(value.values == null ? {} : { values: value.values.map(conditionValue) }),
  }
}
export function condition(value: unknown): Condition {
  if (!schema.getApiV1ComplianceRulesByIdResponse.validateInventoryCondition(value))
    throw new Error('Invalid asset condition')
  return {
    ...conditionContext({ selector: value.selector, quantifier: value.quantifier }),
    criteria: criteria(value.criteria),
  }
}
export function qualityRun(value: unknown): QualityRun {
  if (!schema.getApiV1DevicesByIdInventoryResponse200.validateQualityRun(value))
    throw new Error('Invalid collection quality')
  return {
    ...value,
    sequence: integer(value.sequence),
    fields: value.fields.map((field) => ({
      ...field,
      scope: scope(field.scope),
      itemCount: count(field.itemCount),
      invalidItems: count(field.invalidItems),
      status: nullable(field.status, integer),
      receivedAt: nullable(field.receivedAt, integer),
    })),
  }
}
export function inventoryView(value: unknown): InventoryView {
  if (!schema.getApiV1DevicesByIdInventoryResponse200.validateDeviceView(value))
    throw new Error('Invalid live inventory')
  const namespace = scope(value.collectionScope),
    namespaceKey = JSON.stringify(namespace),
    fields = Object.fromEntries(
      Object.entries(value.fields).map(([key, item]) => {
        const field = resolvedField(item)
        if (field.field !== key) throw new Error('Wrong asset field identity')
        for (const source of field.sources) {
          for (const coordinate of [source.evidence, source.lastKnown?.evidence])
            if (coordinate && JSON.stringify(coordinate.scope) !== namespaceKey)
              throw new Error('Wrong fact namespace')
        }
        return [key, field]
      }),
    ),
    lists = Object.fromEntries(
      Object.entries(value.lists).map(([key, item]) => {
        const sources = item.sources.map((source) => {
          const coordinates = evidence(source.evidence)
          if (JSON.stringify(coordinates.scope) !== namespaceKey)
            throw new Error('Wrong collection namespace')
          return { ...source, state: inventoryListState(source.state), evidence: coordinates }
        })
        return [key, { ...item, state: inventoryListState(item.state), sources }]
      }),
    )
  return {
    ...value,
    collectionScope: namespace,
    fields,
    lists,
    channels: value.channels.map((channel) => {
      if (channel !== 'mdm' && channel !== 'agent') throw new Error('Invalid inventory channel')
      return channel
    }),
    quality: value.quality.map(qualityRun),
    revisions: Object.fromEntries(
      Object.entries(value.revisions).map(([key, value]) => [key, count(value)]),
    ),
  }
}
export function summary(value: unknown) {
  if (!schema.getApiV1DevicesByIdInventoryResponse200.validateSummary(value))
    throw new Error('Invalid asset summary')
  return { total: count(value.total), matched: count(value.matched), unknown: count(value.unknown) }
}
export function windowQuery(
  query: { readonly cursor?: string | undefined; readonly limit?: number | undefined } = {},
  limit = 50,
) {
  return {
    ...(query.cursor === undefined ? {} : { cursor: text(query.cursor) }),
    limit: query.limit === undefined ? limit : count(query.limit),
  }
}
export function boundedObject(value: unknown): Readonly<Record<string, unknown>> {
  return structuredClone(record(value))
}
export function distinct<T>(items: readonly T[], key: (item: T) => string): readonly T[] {
  if (new Set(items.map(key)).size !== items.length) throw new Error('Duplicate result identity')
  return items
}
export { sourceFact }
