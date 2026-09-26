import {
  array,
  boolean,
  closed,
  count,
  enumeration,
  identifier,
  integer,
  nullable,
  record,
  string,
  unique,
  uuid,
} from '../../../services/decode'
export const sourceIds = [
  'manual',
  'mdm.windows',
  'mdm.apple',
  'agent.builtin',
  'agent.script',
  'agent.osquery',
] as const
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
  'is_null',
  'is_not_null',
] as const
export type Operator = (typeof operators)[number]
export type Scalar =
  | { kind: 'string'; value: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'integer' | 'time'; value: number }
export type AssetState =
  | { kind: 'known'; value: Scalar }
  | { kind: 'null' | 'missing' | 'unsupported' | 'deleted' | 'conflict' }
export type Criteria =
  | { kind: 'predicate'; field: string; op: Operator; value?: Scalar; values?: Scalar[] }
  | { kind: 'and' | 'or'; children: Criteria[] }
export interface Query {
  criteria: Criteria | null
  select: string[]
  sort: { field: string; descending: boolean } | null
}
export type ManualChange = { action: 'set'; value: Scalar } | { action: 'null' | 'delete' }
export function fieldKey(value: unknown) {
  const v = identifier(value)
  if (!/^(device|custom)\.[a-z0-9_.]+$/.test(v)) throw new Error('Invalid field')
  return v
}
export function scalar(value: unknown): Scalar {
  const v = closed(value, ['kind', 'value'])
  const kind = enumeration(v['kind'], ['string', 'boolean', 'integer', 'time'] as const)
  if (kind === 'string') {
    const value = string(v['value'])
    if (!value.trim() || [...value].length > 256 || /\p{Cc}/u.test(value))
      throw new Error('Invalid scalar text')
    return { kind, value }
  }
  if (kind === 'boolean') return { kind, value: boolean(v['value']) }
  return { kind, value: integer(v['value']) }
}
export function assetState(value: unknown): AssetState {
  const kind = enumeration(record(value)['kind'], [
    'known',
    'null',
    'missing',
    'unsupported',
    'deleted',
    'conflict',
  ] as const)
  const v = closed(value, kind === 'known' ? ['kind', 'value'] : ['kind'])
  return kind === 'known' ? { kind, value: scalar(v['value']) } : { kind }
}
export function evidence(value: unknown) {
  const v = closed(value, [
    'source',
    'registration',
    'registrationGeneration',
    'epoch',
    'snapshotId',
    'observedAt',
    'receivedAt',
    'actor',
  ])
  return {
    source: enumeration(v['source'], sourceIds),
    registration: nullable(v['registration'], identifier),
    registrationGeneration: nullable(v['registrationGeneration'], count),
    epoch: nullable(v['epoch'], identifier),
    snapshotId: identifier(v['snapshotId']),
    observedAt: integer(v['observedAt']),
    receivedAt: integer(v['receivedAt']),
    actor: nullable(v['actor'], identifier),
  }
}
export function resolvedField(value: unknown) {
  const v = closed(value, ['field', 'state', 'sources'])
  return {
    field: fieldKey(v['field']),
    state: assetState(v['state']),
    sources: unique(
      array(v['sources'], (item) => {
        const s = closed(item, ['state', 'lastKnown', 'evidence'])
        return {
          state: assetState(s['state']),
          evidence: evidence(s['evidence']),
          lastKnown: nullable(s['lastKnown'], (item) => {
            const last = closed(item, ['value', 'evidence'])
            return { value: scalar(last['value']), evidence: evidence(last['evidence']) }
          }),
        }
      }),
      (s) => s.evidence.source,
    ),
  }
}
export function qualityRun(value: unknown) {
  const v = closed(value, [
    'source',
    'channel',
    'registration',
    'registrationGeneration',
    'epoch',
    'runId',
    'sequence',
    'result',
    'deliveryPending',
    'fields',
  ])
  return {
    source: enumeration(v['source'], sourceIds),
    channel: enumeration(v['channel'], ['agent', 'mdm'] as const),
    registration: uuid(v['registration']),
    registrationGeneration: count(v['registrationGeneration']),
    epoch: uuid(v['epoch']),
    runId: uuid(v['runId']),
    sequence: integer(v['sequence']),
    result: enumeration(v['result'], ['pending', 'snapshot', 'partial', 'failed'] as const),
    deliveryPending: boolean(v['deliveryPending']),
    fields: array(v['fields'], (item) => {
      const f = closed(item, ['field', 'quality', 'status', 'receivedAt'])
      return {
        field: fieldKey(f['field']),
        quality: enumeration(f['quality'], [
          'pending',
          'success',
          'unsupported',
          'failed',
          'invalid',
          'missing',
        ] as const),
        status: nullable(f['status'], count),
        receivedAt: nullable(f['receivedAt'], integer),
      }
    }),
  }
}
export function inventory(value: unknown) {
  const v = closed(value, ['device', 'channels', 'fields', 'quality', 'revisions'])
  const fields = record(v['fields'])
  const revisions = record(v['revisions'])
  if (Object.keys(fields).length > 1000 || Object.keys(revisions).length > 1000)
    throw new Error('Too many fields')
  return {
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
    quality: array(v['quality'], qualityRun),
    revisions: Object.fromEntries(
      Object.entries(revisions).map(([key, value]) => [fieldKey(key), count(value)]),
    ),
  }
}
export type Inventory = ReturnType<typeof inventory>
export type ResolvedField = ReturnType<typeof resolvedField>
export function fieldDefinition(value: unknown) {
  const v = closed(value, ['key', 'kind', 'nullable', 'manual', 'sources', 'operations'])
  return {
    key: fieldKey(v['key']),
    kind: enumeration(v['kind'], ['string', 'integer', 'boolean', 'time'] as const),
    nullable: boolean(v['nullable']),
    manual: boolean(v['manual']),
    sources: unique(
      array(v['sources'], (v) => enumeration(v, sourceIds)),
      (s) => s,
    ),
    operations: unique(
      array(v['operations'], (v) => enumeration(v, operators)),
      (s) => s,
    ),
  }
}
export type FieldDefinition = ReturnType<typeof fieldDefinition>
export function criteria(value: unknown, depth = 0): Criteria {
  if (depth > 16) throw new Error('Condition nesting too deep')
  const kind = enumeration(record(value)['kind'], ['predicate', 'and', 'or'] as const)
  if (kind !== 'predicate') {
    const v = closed(value, ['kind', 'children'])
    return { kind, children: array(v['children'], (v) => criteria(v, depth + 1)) }
  }
  const v = closed(value, ['kind', 'field', 'op'], ['value', 'values'])
  const op = enumeration(v['op'], operators)
  const field = fieldKey(v['field'])
  if (op === 'is_null' || op === 'is_not_null') {
    if (v['value'] != null || v['values'] != null) throw new Error('Unexpected operand')
    return { kind, field, op }
  }
  if (op === 'in' || op === 'not_in') {
    if (v['value'] != null) throw new Error('Unexpected operand')
    return { kind, field, op, values: array(v['values'], scalar) }
  }
  if (v['values'] != null) throw new Error('Unexpected operands')
  return { kind, field, op, value: scalar(v['value']) }
}
export function query(value: unknown): Query {
  const v = closed(value, ['criteria', 'select', 'sort'])
  return {
    criteria: nullable(v['criteria'], criteria),
    select: unique(array(v['select'], fieldKey), (s) => s),
    sort: nullable(v['sort'], (value) => {
      const s = closed(value, ['field', 'descending'])
      return { field: fieldKey(s['field']), descending: boolean(s['descending']) }
    }),
  }
}
export function savedQuery(value: unknown) {
  const v = closed(value, ['id', 'revision', 'definition'])
  return {
    id: uuid(v['id']),
    revision: count(v['revision']),
    definition: nullable(v['definition'], (value) => {
      const d = closed(value, ['name', 'query'])
      return { name: identifier(d['name']), query: query(d['query']) }
    }),
  }
}
export type SavedQuery = ReturnType<typeof savedQuery>
export function summary(value: unknown) {
  const v = closed(value, ['matched', 'unknown', 'total'])
  return { matched: count(v['matched']), unknown: count(v['unknown']), total: count(v['total']) }
}
export function assetEnvelope(value: unknown, tenant: string, kind: string, keys: string[]) {
  const envelope = closed(value, ['tenantId', 'asset'])
  if (uuid(envelope['tenantId']) !== tenant) throw new Error('Wrong tenant')
  const v = closed(envelope['asset'], ['kind', ...keys])
  if (v['kind'] !== kind) throw new Error('Wrong asset response')
  return v
}
export const cursor = (v: unknown) => nullable(v, string)
