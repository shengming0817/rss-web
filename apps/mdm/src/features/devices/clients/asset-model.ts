import * as wireSchemas from '@rss/api/mdm-schemas'
import { checked } from '../../../contracts/collection/check'
import { validateFieldView } from '@rss/api/mdm-validators'
import { parseFilter } from '../../../services/query-filter'
import {
  array,
  boolean,
  count,
  enumeration,
  identifier,
  integer,
  nullable,
  string,
  unique,
  uuid,
} from '../../../services/decode'
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
export type Scalar =
  | { kind: 'string'; value: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'integer' | 'time' | 'number'; value: number }
export type AssetState = ReadState
export type Criteria =
  | { kind: 'predicate'; field: string; op: Operator; value?: Scalar; values?: Scalar[] }
  | { kind: 'and' | 'or'; children: Criteria[] }
export interface QueryInput {
  filter: string | null
  scope: ConditionContext
  fields: string[]
  sort: { field: string; descending: boolean }[]
}
export type ManualChange = { action: 'set'; value: Scalar } | { action: 'null' | 'delete' }
export function fieldKey(value: unknown) {
  const v = identifier(value)
  if (v.length > 128 || !/^(device|custom|channel)(\.[a-z][a-z0-9_]*)+$/.test(v))
    throw new Error('Invalid field')
  return v
}
export function retentionKey(value: unknown) {
  const v = string(value)
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(v)) throw new Error('Invalid retention key')
  return v
}
export function scalar(value: unknown): Scalar {
  if (!wireSchemas.getApiV1DevicesByIdInventoryResponse200.validateScalar(value))
    throw new Error('Invalid contract value')

  const v = value
  const kind = enumeration(v['kind'], ['string', 'boolean', 'integer', 'time', 'number'] as const)
  if (kind === 'string') {
    const value = string(v['value'])
    if (!value.trim() || [...value].length > 256 || /\p{Cc}/u.test(value))
      throw new Error('Invalid scalar text')
    return { kind, value }
  }
  if (kind === 'number') {
    const n = v['value']
    if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error('Invalid number')
    return { kind, value: n }
  }
  if (kind === 'boolean') return { kind, value: boolean(v['value']) }
  return { kind, value: integer(v['value']) }
}
export function resolvedField(value: unknown) {
  if (!wireSchemas.getApiV1DevicesByIdInventoryResponse200.validateResolvedField(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    field: fieldKey(v['field']),
    state: assetState(v['state']),
    sources: unique(array(v['sources'], sourceFact), (s) => sourceIdentity(s.evidence)),
  }
}
export function qualityRun(value: unknown) {
  if (!wireSchemas.getApiV1DeviceViewsByKindByIdResponse.validateQualityRun(value))
    throw new Error('Invalid contract value')

  const v = value
  const coverage = v['coverage']
  return {
    dataset: identifier(v['dataset']),
    templateVersion: identifier(v['templateVersion']),
    fingerprint: identifier(v['fingerprint']),
    coverage: {
      id: identifier(coverage['id']),
      version: identifier(coverage['version']),
      definition: identifier(coverage['definition']),
      format: identifier(coverage['format']),
    },
    complete: v['complete'],
    source: v['source'],
    channel: v['channel'],
    registration: uuid(v['registration']),
    registrationGeneration: count(v['registrationGeneration']),
    epoch: uuid(v['epoch']),
    runId: uuid(v['runId']),
    sequence: integer(v['sequence']),
    result: v['result'],
    deliveryPending: v['deliveryPending'],
    fields: array(v['fields'], (item) => {
      const f = item
      return {
        scope: collectionScope(f['scope']),
        reason: nullable(f['reason'], identifier),
        itemCount: count(f['itemCount']),
        invalidItems: count(f['invalidItems']),
        field: fieldKey(f['field']),
        quality: f['quality'],
        status: nullable(f['status'], count),
        receivedAt: nullable(f['receivedAt'], integer),
      }
    }),
  }
}
export function inventory(value: unknown) {
  if (!wireSchemas.getApiV1DevicesByIdInventoryResponse200.validateDeviceView(value))
    throw new Error('Invalid contract value')

  const v = value
  const fields = v['fields']
  const revisions = v['revisions']
  if (Object.keys(fields).length > 1000 || Object.keys(revisions).length > 1000)
    throw new Error('Too many fields')
  const result = {
    collectionScope: collectionScope(v['collectionScope']),
    device: identifier(v['device']),
    channels: unique(
      array(v['channels'], (s) => enumeration(s, ['agent', 'mdm'] as const)),
      (s) => s,
    ),
    fields: Object.fromEntries(
      Object.entries(fields).map(([key, value]) => {
        const field = resolvedField(value)
        if (field.field !== key) throw new Error('Mismatched field')
        return [fieldKey(key), field]
      }),
    ),
    lists: Object.fromEntries(
      Object.entries(v['lists']).map(([key, x]) => {
        fieldKey(key)
        const l = x
        return [
          key,
          {
            state: listState(l['state']),
            sources: array(l['sources'], (x) => {
              const source = x
              return {
                state: listState(source['state']),
                evidence: evidence(source['evidence']),
                cursor: pageToken(source['cursor']),
              }
            }),
            itemKey: nullable(l['itemKey'], identifier),
            cursor: pageToken(l['cursor']),
          },
        ]
      }),
    ),
    quality: array(v['quality'], qualityRun),
    revisions: Object.fromEntries(
      Object.entries(revisions).map(([key, value]) => [fieldKey(key), count(value)]),
    ),
  }
  const expected = JSON.stringify(result.collectionScope)
  const same = (scope: CollectionScope) => {
    if (JSON.stringify(scope) !== expected) throw new Error('Inventory namespace mismatch')
  }
  for (const field of Object.values(result.fields))
    for (const source of field.sources) {
      same(source.evidence.scope)
      if (source.lastKnown) same(source.lastKnown.evidence.scope)
    }
  for (const list of Object.values(result.lists))
    for (const source of list.sources) same(source.evidence.scope)
  for (const quality of result.quality) for (const field of quality.fields) same(field.scope)
  return result
}
export type Inventory = ReturnType<typeof inventory>
export type ResolvedField = ReturnType<typeof resolvedField>
export function fieldDefinition(value: unknown) {
  const definition = checked(validateFieldView, value)
  const kind = definition.valueType.kind
  return {
    ...definition,
    kind: kind === 'enum' ? ('string' as const) : kind === 'record' ? ('object' as const) : kind,
  }
}
export type { ValueType } from '@rss/api/mdm-types'
/** Write only the canonical definition; server-computed presentation never enters a mutation. */
export function fieldInput(field: FieldDefinition): Omit<FieldDefinition, 'kind' | 'operations'> {
  return {
    key: field.key,
    timeSeries: field.timeSeries,
    version: field.version,
    valueType: field.valueType,
    nullable: field.nullable,
    manual: field.manual,
    sources: field.sources,
    platforms: field.platforms,
    sensitivity: field.sensitivity,
    unit: field.unit,
    searchable: field.searchable,
    itemKey: field.itemKey,
  }
}
export function editableField<T extends { kind: string }>(
  field: T,
): field is T & { kind: Scalar['kind'] } {
  return ['string', 'integer', 'boolean', 'time'].includes(field.kind)
}
export type FieldDefinition = ReturnType<typeof fieldDefinition>
export function criteria(value: unknown, depth = 0): Criteria {
  if (!wireSchemas.getApiV1ComplianceRulesByIdResponse.validateCriteria(value))
    throw new Error('Invalid contract value')

  if (depth > 16) throw new Error('Condition nesting too deep')
  const kind = value['kind']
  if (kind !== 'predicate') {
    const v = value
    return { kind, children: array(v['children'], (v) => criteria(v, depth + 1)) }
  }
  const v = value
  const op = v['op']
  const field = fieldKey(v['field'])
  if (op === 'is_null' || op === 'is_not_null') {
    if (v['value'] != null || v['values'] != null) throw new Error('Unexpected operand')
    return { kind, field, op }
  }
  if (op === 'in' || op === 'not_in' || op === 'contains_any' || op === 'contains_all') {
    if (v['value'] != null) throw new Error('Unexpected operand')
    return { kind, field, op, values: array(v['values'], scalar) }
  }
  if (v['values'] != null) throw new Error('Unexpected operands')
  return { kind, field, op, value: scalar(v['value']) }
}
export function queryInput(value: unknown): QueryInput {
  if (!wireSchemas.getApiV1DevicesByIdInventoryResponse200.validateQueryInput(value))
    throw new Error('Invalid contract value')

  const v = value
  const filter = nullable(v['filter'], (value) => {
    if (typeof value !== 'string') throw new Error('Invalid filter')
    parseFilter(value)
    return value
  })
  const scope = conditionContext(v['scope'])
  if (filter === null && (scope.selector.kind !== 'device' || scope.quantifier !== 'one'))
    throw new Error('Scope requires a predicate')
  const fields = unique(array(v['fields'], fieldKey), (s) => s)
  const sort = unique(
    array(v['sort'], (value) => {
      const s = value
      return { field: fieldKey(s['field']), descending: s['descending'] }
    }),
    (s) => s.field,
  )
  if (fields.length > 1024 || sort.length > 16) throw new Error('Invalid query budget')
  return { filter, scope, fields, sort }
}
export function savedDefinition(value: unknown) {
  if (!wireSchemas.getApiV1DevicesByIdInventoryResponse200.validateSavedDefinition(value))
    throw new Error('Invalid contract value')

  const d = value
  return { name: identifier(d['name']), query: queryInput(d['query']) }
}
export function savedQuery(value: unknown) {
  if (!wireSchemas.getApiV1DevicesByIdInventoryResponse200.validateSavedView(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    id: uuid(v['id']),
    revision: count(v['revision']),
    definition: nullable(v['definition'], savedDefinition),
  }
}
export type SavedQuery = ReturnType<typeof savedQuery>
export function summary(value: unknown) {
  if (!wireSchemas.getApiV1DevicesByIdInventoryResponse200.validateSummary(value))
    throw new Error('Invalid contract value')

  const v = value
  return { matched: count(v['matched']), unknown: count(v['unknown']), total: count(v['total']) }
}
type InventoryAssetWire =
  | wireSchemas.getApiV1DevicesByIdInventoryResponse200.Root['asset']
  | wireSchemas.getApiV1DevicesByIdInventoryResponse202.Root['asset']
export function assetEnvelope<K extends InventoryAssetWire['kind']>(
  value: unknown,
  tenant: string,
  kind: K,
): Extract<InventoryAssetWire, { kind: K }> {
  if (
    !wireSchemas.getApiV1DevicesByIdInventoryResponse200.validateRoot(value) &&
    !wireSchemas.getApiV1DevicesByIdInventoryResponse202.validateRoot(value)
  )
    throw new Error('Invalid asset envelope')
  if (value.tenantId !== tenant || value.asset.kind !== kind) throw new Error('Wrong asset binding')
  return value.asset as Extract<InventoryAssetWire, { kind: K }>
}
export function pageToken(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 16384 || /\p{Cc}/u.test(value))
    throw new Error('Invalid cursor')
  return value
}
export const cursor = (v: unknown) => nullable(v, pageToken)

export const sourceIds = [
  'manual',
  'mdm.windows',
  'mdm.apple',
  'agent.builtin',
  'agent.script',
  'agent.native',
  'agent.osquery',
] as const
export type ReadScalar = wireSchemas.getApiV1DeviceViewsResponse.Scalar
export function readScalar(value: unknown): ReadScalar {
  if (!wireSchemas.getApiV1DeviceViewsResponse.validateScalar(value))
    throw new Error('Invalid asset value')
  let nodes = 0,
    bytes = 0
  function visit(node: ReadScalar, depth: number): void {
    if (depth > 5 || ++nodes > 200000) throw new Error('Asset value exceeds bounds')
    if (node.kind === 'string') {
      if (node.value.includes('\0')) throw new Error('Invalid asset text')
      bytes += new TextEncoder().encode(node.value).length
    } else if (node.kind === 'array') {
      for (const child of node.value) visit(child, depth + 1)
    } else if (node.kind === 'object') {
      for (const [key, child] of Object.entries(node.value)) {
        if (key.includes('\0')) throw new Error('Invalid asset key')
        bytes += new TextEncoder().encode(key).length
        visit(child, depth + 1)
      }
    } else if (node.kind === 'integer' || node.kind === 'time') integer(node.value)
    if (bytes > 16 * 1024 * 1024) throw new Error('Asset text exceeds bounds')
  }
  visit(value, 0)
  return value
}
export type ReadState =
  | { kind: 'known'; value: ReadScalar }
  | { kind: 'null' | 'missing' | 'unsupported' | 'deleted' | 'conflict' }
  | { kind: 'unknown'; reason: ReturnType<typeof unknownReason> }
export function unknownReason(value: unknown) {
  return enumeration(value, [
    'unordered_conflict',
    'incomplete',
    'native_status',
    'evidence_limit',
  ] as const)
}
export function assetState(value: unknown): ReadState {
  if (!wireSchemas.getApiV1DevicesByIdInventoryResponse200.validateState(value))
    throw new Error('Invalid contract value')

  if (value.kind === 'unknown') return { kind: 'unknown' as const, reason: value.value.reason }
  return value.kind === 'known' ? { kind: value.kind, value: readScalar(value.value) } : value
}
export function evidence(value: unknown) {
  if (!wireSchemas.getApiV1DeviceViewsResponse.validateEvidence(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    scope: collectionScope(v['scope']),
    source: v['source'],
    dataset: nullable(v['dataset'], identifier),
    registration: nullable(v['registration'], identifier),
    registrationGeneration: nullable(v['registrationGeneration'], count),
    epoch: nullable(v['epoch'], identifier),
    snapshotId: identifier(v['snapshotId']),
    observedAt: integer(v['observedAt']),
    receivedAt: integer(v['receivedAt']),
    actor: nullable(v['actor'], identifier),
  }
}
export type Evidence = ReturnType<typeof evidence>
export function sourceFact(value: unknown) {
  if (!wireSchemas.getApiV1DevicesByIdInventoryResponse200.validateSourceFact(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    state: assetState(v['state']),
    evidence: evidence(v['evidence']),
    lastKnown: nullable(v['lastKnown'], (x) => {
      const last = x
      return { value: readScalar(last['value']), evidence: evidence(last['evidence']) }
    }),
  }
}
export function listState(value: unknown) {
  if (!wireSchemas.getApiV1DeviceViewsByKindByIdResponse.validateListState(value))
    throw new Error('Invalid list state')
  return value
}
export function sourceIdentity(value: Evidence) {
  return JSON.stringify([value.source, value.dataset])
}

function account(value: unknown) {
  if (!wireSchemas.getApiV1DeviceViewsResponse.validateLocalAccountIdentity(value))
    throw new Error('Invalid account')
  if (value.kind === 'windows') sid(value.sid)
  else {
    uid(value.uid)
    uuid(value.generated_uid)
  }
  return value
}
function sid(value: unknown) {
  const s = identifier(value)
  if (s.length > 184 || !/^S-1-(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*)){1,}$/.test(s))
    throw new Error('Invalid SID')
  return s
}
function uid(value: unknown) {
  const n = count(value)
  if (!n || n > 4294967295) throw new Error('Invalid UID')
  return n
}
export function collectionScope(value: unknown) {
  if (!wireSchemas.getApiV1DeviceViewsResponse.validateCollectionScope(value))
    throw new Error('Invalid collection scope')
  if (value.kind === 'native_user') account(value.owner)
  if (value.kind === 'macos_applications' && (value.root === 'user') !== (value.uid !== null))
    throw new Error('Invalid application owner')
  if (value.kind === 'macos_brew') {
    uid(value.uid)
    const { prefix, taps } = value
    if (
      !prefix.startsWith('/') ||
      prefix
        .slice(1)
        .split('/')
        .some((p) => !p || p === '.' || p === '..') ||
      taps.some(
        (t) =>
          !/^[a-z0-9._-]+\/[a-z0-9._-]+$/.test(t) ||
          t.split('/').some((p) => p === '.' || p === '..'),
      )
    )
      throw new Error('Invalid Homebrew scope')
    return { ...value, taps: [...unique(taps, (t) => t)].sort() }
  }
  if (value.kind === 'native_accounts') {
    for (const identity of value.identities) (value.platform === 'windows' ? sid : uuid)(identity)
    return { ...value, identities: [...unique(value.identities, (x) => x)].sort() }
  }
  if (value.kind === 'native_certificates' || value.kind === 'native_application') {
    if (value.owner && account(value.owner).kind !== value.platform)
      throw new Error('Wrong account platform')
    if (value.kind === 'native_certificates') {
      const stores =
        value.platform === 'windows'
          ? ['my', 'root', 'ca', 'trusted_publisher']
          : ['system', 'system_roots', 'login']
      if (
        !stores.includes(value.store) ||
        (value.platform === 'macos' && (value.store === 'login') !== (value.owner !== null))
      )
        throw new Error('Invalid certificate owner')
    }
  }
  return value
}
export type CollectionScope = wireSchemas.getApiV1DeviceViewsResponse.CollectionScope
export function scopeSelector(value: unknown) {
  if (!wireSchemas.getApiV1DevicesByIdInventoryResponse200.validateScopeSelector(value))
    throw new Error('Invalid contract value')

  const kind = value['kind']
  if (kind === 'device' || kind === 'all_authorized') {
    return { kind }
  }
  if (kind === 'exact') {
    const v = value
    return { kind, scope: collectionScope(v['scope']) }
  }
  const v = value,
    platform = v['platform'],
    identity = identifier(v['identity'])
  if (platform === 'windows') sid(identity)
  else if (!/^[1-9]\d*$/.test(identity) || Number(identity) > 4294967295)
    throw new Error('Invalid UID')
  return { kind, platform, identity }
}
export interface ConditionContext {
  selector: ReturnType<typeof scopeSelector>
  quantifier: 'one' | 'any' | 'all'
}
export interface InventoryCondition extends ConditionContext {
  criteria: Criteria
}
export function conditionContext(value: unknown): ConditionContext {
  if (!wireSchemas.getApiV1DevicesByIdInventoryResponse200.validateQueryScope(value))
    throw new Error('Invalid contract value')

  const v = value,
    selector = scopeSelector(v['selector']),
    quantifier = v['quantifier']
  if ((selector.kind === 'device' || selector.kind === 'exact') !== (quantifier === 'one'))
    throw new Error('Invalid condition quantifier')
  return { selector, quantifier }
}
export function inventoryCondition(value: unknown): InventoryCondition {
  if (!wireSchemas.getApiV1ComplianceRulesByIdResponse.validateInventoryCondition(value))
    throw new Error('Invalid contract value')

  const v = value
  return {
    ...conditionContext({ selector: v['selector'], quantifier: v['quantifier'] }),
    criteria: criteria(v['criteria']),
  }
}
export function deviceCondition(
  criteria: Criteria = { kind: 'and', children: [] },
): InventoryCondition {
  return { selector: { kind: 'device' }, quantifier: 'one', criteria }
}
