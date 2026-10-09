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
export type AssetState = ReadState
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
  if (v.length > 128 || !/^(device|custom|channel)(\.[a-z][a-z0-9_]*)+$/.test(v))
    throw new Error('Invalid field')
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
export function resolvedField(value: unknown) {
  const v = closed(value, ['field', 'state', 'sources'])
  return {
    field: fieldKey(v['field']),
    state: assetState(v['state']),
    sources: unique(array(v['sources'], sourceFact), (s) => sourceIdentity(s.evidence)),
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
      const f = closed(item, [
        'field',
        'quality',
        'status',
        'receivedAt',
        'itemCount',
        'invalidItems',
      ])
      return {
        itemCount: count(f['itemCount']),
        invalidItems: count(f['invalidItems']),
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
  const v = closed(value, ['device', 'channels', 'fields', 'lists', 'quality', 'revisions'])
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
    lists: Object.fromEntries(
      Object.entries(record(v['lists'])).map(([key, x]) => {
        fieldKey(key)
        const l = closed(x, ['state', 'sources', 'itemKey', 'cursor'])
        return [
          key,
          {
            state: listState(l['state']),
            sources: array(l['sources'], (x) => {
              const source = closed(x, ['state', 'evidence', 'cursor'])
              return {
                state: listState(source['state']),
                evidence: evidence(source['evidence']),
                cursor: identifier(source['cursor']),
              }
            }),
            itemKey: nullable(l['itemKey'], identifier),
            cursor: identifier(l['cursor']),
          },
        ]
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
  const v = closed(value, [
    'key',
    'version',
    'valueType',
    'nullable',
    'manual',
    'sources',
    'platforms',
    'sensitivity',
    'unit',
    'searchable',
    'itemKey',
    'operations',
  ])
  count(v['version'])
  array(v['platforms'], (x) => enumeration(x, ['windows', 'macos'] as const))
  enumeration(v['sensitivity'], ['standard', 'sensitive'] as const)
  nullable(v['unit'], string)
  nullable(v['itemKey'], identifier)
  boolean(v['searchable'])
  const kind = valueType(v['valueType'])
  const sources = Object.entries(record(v['sources'])).map(([k, n]) => {
    enumeration(k, sourceIds)
    if (count(n) > 65535) throw new Error('Invalid priority')
    return k as (typeof sourceIds)[number]
  })
  return {
    key: fieldKey(v['key']),
    kind,
    nullable: boolean(v['nullable']),
    manual: boolean(v['manual']),
    sources,
    operations: unique(
      array(v['operations'], (x) => enumeration(x, operators)),
      (x) => x,
    ),
  }
}
function valueType(
  value: unknown,
  depth = 0,
): 'string' | 'integer' | 'number' | 'boolean' | 'time' | 'array' | 'object' {
  if (depth > 5) throw new Error('Field type exceeds bounds')
  const v = record(value),
    kind = enumeration(v['kind'], [
      'string',
      'enum',
      'integer',
      'number',
      'boolean',
      'time',
      'array',
      'object',
    ] as const)
  if (kind === 'string') {
    closed(v, ['kind', 'maxLength', 'allowEmpty'])
    if (count(v['maxLength']) < 1 || count(v['maxLength']) > 65536)
      throw new Error('Invalid text bounds')
    boolean(v['allowEmpty'])
  } else if (kind === 'enum') {
    closed(v, ['kind', 'values'])
    if (!array(v['values'], identifier).length) throw new Error('Empty enum')
  } else if (kind === 'array') {
    closed(v, ['kind', 'items', 'maxItems'])
    count(v['maxItems'])
    valueType(v['items'], depth + 1)
  } else if (kind === 'object') {
    closed(v, ['kind', 'properties'])
    Object.entries(record(v['properties'])).forEach(([k, x]) => {
      identifier(k)
      valueType(x, depth + 1)
    })
  } else closed(v, ['kind'])
  return kind === 'enum' ? 'string' : kind
}
export function editableField<T extends { kind: string }>(
  field: T,
): field is T & { kind: Scalar['kind'] } {
  return ['string', 'integer', 'boolean', 'time'].includes(field.kind)
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

export const sourceIds = [
  'manual',
  'mdm.windows',
  'mdm.apple',
  'agent.builtin',
  'agent.script',
  'agent.osquery',
] as const
export type ReadScalar =
  | { kind: 'string'; value: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'integer' | 'time' | 'number'; value: number }
  | { kind: 'array'; value: ReadScalar[] }
  | { kind: 'object'; value: Record<string, ReadScalar> }
export function readScalar(value: unknown): ReadScalar {
  let nodes = 0,
    bytes = 0
  function decode(value: unknown, depth: number): ReadScalar {
    if (depth > 5 || ++nodes > 200000) throw new Error('Asset value exceeds bounds')
    const v = closed(value, ['kind', 'value']),
      kind = enumeration(v['kind'], [
        'string',
        'boolean',
        'integer',
        'time',
        'number',
        'array',
        'object',
      ] as const)
    if (kind === 'string') {
      if (typeof v['value'] !== 'string' || v['value'].includes('\0'))
        throw new Error('Invalid asset text')
      bytes += new TextEncoder().encode(v['value']).length
      if (bytes > 16 * 1024 * 1024) throw new Error('Asset text exceeds bounds')
      return { kind, value: v['value'] }
    }
    if (kind === 'boolean') return { kind, value: boolean(v['value']) }
    if (kind === 'number') {
      if (typeof v['value'] !== 'number' || !Number.isFinite(v['value']))
        throw new Error('Invalid number')
      return { kind, value: v['value'] }
    }
    if (kind === 'integer' || kind === 'time') return { kind, value: integer(v['value']) }
    if (kind === 'array') {
      if (!Array.isArray(v['value']) || v['value'].length > 200000)
        throw new Error('Invalid asset array')
      return { kind, value: v['value'].map((x) => decode(x, depth + 1)) }
    }
    const entries = Object.entries(record(v['value']))
    if (entries.length > 200000) throw new Error('Invalid asset object')
    return {
      kind,
      value: Object.fromEntries(
        entries.map(([k, x]) => {
          if (k.includes('\0')) throw new Error('Invalid asset key')
          bytes += new TextEncoder().encode(k).length
          if (bytes > 16 * 1024 * 1024) throw new Error('Asset text exceeds bounds')
          return [k, decode(x, depth + 1)]
        }),
      ),
    }
  }
  return decode(value, 0)
}
export type ReadState =
  | { kind: 'known'; value: ReadScalar }
  | { kind: 'null' | 'missing' | 'unsupported' | 'deleted' | 'conflict' }
export function assetState(value: unknown): ReadState {
  const kind = enumeration(record(value)['kind'], [
      'known',
      'null',
      'missing',
      'unsupported',
      'deleted',
      'conflict',
    ] as const),
    v = closed(value, kind === 'known' ? ['kind', 'value'] : ['kind'])
  return kind === 'known' ? { kind, value: readScalar(v['value']) } : { kind }
}
export function evidence(value: unknown) {
  const v = closed(value, [
    'source',
    'dataset',
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
  const v = closed(value, ['state', 'lastKnown', 'evidence'])
  return {
    state: assetState(v['state']),
    evidence: evidence(v['evidence']),
    lastKnown: nullable(v['lastKnown'], (x) => {
      const last = closed(x, ['value', 'evidence'])
      return { value: readScalar(last['value']), evidence: evidence(last['evidence']) }
    }),
  }
}
export function listState(value: unknown) {
  const kind = enumeration(record(value)['kind'], [
      'known',
      'null',
      'missing',
      'unsupported',
      'deleted',
      'conflict',
    ] as const),
    v = closed(value, kind === 'known' ? ['kind', 'count', 'digest'] : ['kind'])
  return kind === 'known'
    ? { kind, count: count(v['count']), digest: identifier(v['digest']) }
    : { kind }
}
export function sourceIdentity(value: Evidence) {
  return JSON.stringify([value.source, value.dataset])
}
